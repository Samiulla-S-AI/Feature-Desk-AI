
import { db } from './firebase';
import { collection, addDoc, query, where, orderBy, getDocs, onSnapshot, limit } from 'firebase/firestore';

// ===================================================================
// Firebase Firestore Service (Chat History ONLY)
// ===================================================================
// This file ONLY handles Firestore (NoSQL database) for chat sessions.
// All media storage (images, PDFs, documents) uses Cloudinary.
// All structured data uses Supabase.
// ===================================================================

/**
 * Service for handling Firestore database operations.
 * Used for structured, real-time data like Chat History and Activity Logs.
 */
export const firestoreService = {
    /**
     * Creates a new chat session.
     */
    async createChatSession(userId: string, initialTitle: string = 'New Chat'): Promise<string> {
        try {
            const docRef = await addDoc(collection(db, 'chat_sessions'), {
                userId,
                title: initialTitle,
                createdAt: new Date(),
                lastMessageAt: new Date()
            });
            return docRef.id;
        } catch (error) {
            console.error('❌ Error creating chat session:', error);
            throw error;
        }
    },

    /**
     * Updates the title of a chat session.
     */
    async updateSessionTitle(sessionId: string, newTitle: string): Promise<void> {
        try {
            const { doc, updateDoc } = await import('firebase/firestore');
            const sessionRef = doc(db, 'chat_sessions', sessionId);
            await updateDoc(sessionRef, { title: newTitle });
        } catch (error) {
            console.error('❌ Error updating session title:', error);
            throw error;
        }
    },

    /**
     * Retrieves all chat sessions for a user, ordered by last activity.
     */
    async getUserSessions(userId: string): Promise<any[]> {
        try {
            const q = query(
                collection(db, 'chat_sessions'),
                where('userId', '==', userId),
                orderBy('lastMessageAt', 'desc')
            );
            const snapshot = await getDocs(q);
            return snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                createdAt: doc.data().createdAt?.toDate(),
                lastMessageAt: doc.data().lastMessageAt?.toDate()
            }));
        } catch (error) {
            console.error('❌ Error getting user sessions:', error);
            throw error;
        }
    },

    /**
     * Saves a chat message to Firestore (Session-aware).
     */
    async saveChatMessage(userId: string, message: any, sessionId?: string): Promise<string> {
        try {
            const messageData = {
                ...message,
                userId,
                sessionId: sessionId || 'general',
                timestamp: new Date()
            };

            const docRef = await addDoc(collection(db, 'chat_history'), messageData);

            // Update session lastMessageAt if sessionId is provided
            if (sessionId) {
                const { doc, updateDoc } = await import('firebase/firestore');
                const sessionRef = doc(db, 'chat_sessions', sessionId);
                try {
                    await updateDoc(sessionRef, {
                        lastMessageAt: new Date(),
                        preview: typeof message.content === 'string' ? message.content.substring(0, 50) : ''
                    });
                } catch (e) {
                    // Session might not exist or legacy chat
                }
            }

            console.log('✅ Chat message saved to Firestore:', docRef.id);
            return docRef.id;
        } catch (error) {
            console.error('❌ Error saving chat message:', error);
            throw error;
        }
    },

    /**
     * Retrieves chat history for a user (Session-aware).
     */
    async getChatHistory(userId: string, sessionId?: string, limitCount = 50): Promise<any[]> {
        try {
            let q;
            if (sessionId) {
                q = query(
                    collection(db, 'chat_history'),
                    where('userId', '==', userId),
                    where('sessionId', '==', sessionId),
                    orderBy('timestamp', 'asc'),
                    limit(limitCount)
                );
            } else {
                q = query(
                    collection(db, 'chat_history'),
                    where('userId', '==', userId),
                    orderBy('timestamp', 'asc'),
                    limit(limitCount)
                );
            }

            const querySnapshot = await getDocs(q);
            const messages = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                timestamp: doc.data().timestamp?.toDate() || new Date()
            }));

            console.log(`✅ Retrieved ${messages.length} chat messages`);
            return messages;
        } catch (error) {
            console.error('❌ Error getting chat history:', error);
            throw error;
        }
    },

    /**
     * Subscribes to real-time chat updates (Session-aware).
     */
    subscribeToChat(userId: string, callback: (messages: any[]) => void, sessionId?: string): () => void {
        let q;
        if (sessionId) {
            q = query(
                collection(db, 'chat_history'),
                where('userId', '==', userId),
                where('sessionId', '==', sessionId),
                orderBy('timestamp', 'asc'),
                limit(100)
            );
        } else {
            q = query(
                collection(db, 'chat_history'),
                where('userId', '==', userId),
                orderBy('timestamp', 'asc'),
                limit(100)
            );
        }

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const messages = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                timestamp: doc.data().timestamp?.toDate() || new Date()
            }));
            callback(messages);
        }, (error) => {
            console.error('❌ Error in chat subscription:', error);
        });

        return unsubscribe;
    },

    /**
    * Save student feedback to Firestore
    */
    async saveStudentFeedback(studentId: string, feedbackData: any): Promise<void> {
        try {
            // Create a document reference with a composite ID or let Firestore generate one
            // Using addDoc for simplicity, or setDoc with a specific ID if uniqueness is required
            await addDoc(collection(db, 'student_feedback'), {
                studentId,
                ...feedbackData,
                timestamp: new Date()
            });
            console.log('✅ Student feedback saved to Firestore for:', studentId);
        } catch (error) {
            console.error('❌ Error saving student feedback:', error);
        }
    },

    /**
     * Get student feedback from Firestore
     */
    async getStudentFeedback(studentId: string): Promise<any[]> {
        try {
            const q = query(
                collection(db, 'student_feedback'),
                where('studentId', '==', studentId),
                orderBy('timestamp', 'desc')
            );
            const snapshot = await getDocs(q);
            return snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                timestamp: doc.data().timestamp?.toDate() || new Date()
            }));
        } catch (error) {
            console.error('❌ Error fetching student feedback:', error);
            return [];
        }
    },

    /**
     * Save a school note to Firestore
     */
    async saveSchoolNote(noteData: any): Promise<string> {
        try {
            const docRef = await addDoc(collection(db, 'school_notes'), {
                ...noteData,
                uploadedAt: new Date()
            });
            console.log('✅ School note saved to Firestore:', docRef.id);
            return docRef.id;
        } catch (error) {
            console.error('❌ Error saving school note:', error);
            throw error;
        }
    },

    /**
     * Get school notes for a class
     */
    async getSchoolNotesByClass(classId: number): Promise<any[]> {
        try {
            const q = query(
                collection(db, 'school_notes'),
                where('classId', '==', Number(classId))
            );
            const snapshot = await getDocs(q);
            return snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                uploadedAt: doc.data().uploadedAt?.toDate() || new Date()
            })).sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime());
        } catch (error) {
            console.error('❌ Error fetching school notes:', error);
            return [];
        }
    },

    /**
     * Delete a school note from Firestore
     */
    async deleteSchoolNote(noteId: string): Promise<void> {
        try {
            const { doc, deleteDoc } = await import('firebase/firestore');
            const noteRef = doc(db, 'school_notes', noteId);
            await deleteDoc(noteRef);
            console.log('✅ School note deleted from Firestore:', noteId);
        } catch (error) {
            console.error('❌ Error deleting school note:', error);
            throw error;
        }
    }
};

