import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { Student, Teacher } from '../lib/supabase';

interface SchoolAdmin {
  id: string;
  email: string;
  name: string;
  role: 'principal' | 'admin' | 'coordinator';
  school_id?: string;
}

interface AuthContextType {
  user: Student | Teacher | SchoolAdmin | null;
  userType: 'student' | 'teacher' | 'school' | null;
  login: (credentials: any, type: 'student' | 'teacher' | 'school') => Promise<boolean>;
  loginAsDemo: (type: 'student' | 'teacher' | 'school') => void;
  logout: () => void;
  setClassSubject: (classId: number, subjectCode: string) => Promise<void>;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Student | Teacher | SchoolAdmin | null>(null);
  const [userType, setUserType] = useState<'student' | 'teacher' | 'school' | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check for existing session
    const savedUser = localStorage.getItem('featuredesk_user');
    const savedUserType = localStorage.getItem('featuredesk_user_type');

    if (savedUser && savedUserType) {
      setUser(JSON.parse(savedUser));
      setUserType(savedUserType as 'student' | 'teacher' | 'school');
    }
    setLoading(false);
  }, []);

  const loginAsDemo = (type: 'student' | 'teacher' | 'school') => {
    let mockUser: any;
    if (type === 'student') {
      // Use first demo student from Class 7
      mockUser = {
        id: '10000000-0000-0000-0000-000000000001',
        student_name: 'Aarav Sharma',
        roll_number: '7A001',
        current_class: 7,
        current_subject: 'MATH',
        email: 'aarav.sharma@student.edu',
        gender: 'Male'
      };
    } else if (type === 'teacher') {
      // Use demo teacher from database
      mockUser = {
        id: '00000000-0000-0000-0000-000000000001',
        teacher_name: 'Mrs. Priya Sharma',
        email: 'teacher@demo.com',
        is_class_teacher: true,
        assigned_class: 7,
        assigned_subjects: ['MATH', 'SCIENCE', 'ENGLISH', 'HINDI', 'TAMIL', 'SOCIAL', 'COMPUTER']
      };
    } else {
      mockUser = {
        id: '00000000-0000-0000-0000-000000000002',
        email: 'admin@school.edu',
        name: 'School Administrator',
        role: 'principal'
      };
    }
    setUser(mockUser);
    setUserType(type);
    localStorage.setItem('featuredesk_user', JSON.stringify(mockUser));
    localStorage.setItem('featuredesk_user_type', type);
  };

  const login = async (credentials: any, type: 'student' | 'teacher' | 'school'): Promise<boolean> => {
    try {
      if (type === 'student') {
        const { data, error } = await supabase
          .from('students')
          .select('*')
          .eq('roll_number', credentials.rollNumber)
          .eq('password', credentials.password)
          .single();

        if (error || !data) return false;

        setUser(data);
        setUserType('student');
        localStorage.setItem('featuredesk_user', JSON.stringify(data));
        localStorage.setItem('featuredesk_user_type', 'student');
        return true;
      } else if (type === 'teacher') {
        const { data, error } = await supabase
          .from('teachers')
          .select('*')
          .eq('email', credentials.email)
          .eq('password', credentials.password)
          .single();

        if (error || !data) return false;

        setUser(data);
        setUserType('teacher');
        localStorage.setItem('featuredesk_user', JSON.stringify(data));
        localStorage.setItem('featuredesk_user_type', 'teacher');
        return true;
      } else if (type === 'school') {
        // School admin login - try school_admins table first, fallback to demo mode
        const { data, error } = await supabase
          .from('school_admins')
          .select('*')
          .eq('email', credentials.email)
          .eq('password', credentials.password)
          .single();

        if (!error && data) {
          setUser(data);
          setUserType('school');
          localStorage.setItem('featuredesk_user', JSON.stringify(data));
          localStorage.setItem('featuredesk_user_type', 'school');
          return true;
        }

        // Demo mode: Allow specific demo credentials
        if (credentials.email === 'admin@school.edu' && credentials.password === 'admin123') {
          const demoAdmin: SchoolAdmin = {
            id: '00000000-0000-0000-0000-000000000002',
            email: 'admin@school.edu',
            name: 'School Administrator',
            role: 'principal'
          };
          setUser(demoAdmin);
          setUserType('school');
          localStorage.setItem('featuredesk_user', JSON.stringify(demoAdmin));
          localStorage.setItem('featuredesk_user_type', 'school');
          return true;
        }

        return false;
      }
      return false;
    } catch (error) {
      console.error('Login error:', error);
      return false;
    }
  };

  const setClassSubject = async (classId: number, subjectCode: string) => {
    if (!user) return;

    // Local state & storage updates should always succeed immediately (including for guest/demo users)
    const updatedUser = { ...user, current_class: classId, current_subject: subjectCode };
    setUser(updatedUser);
    localStorage.setItem('featuredesk_user', JSON.stringify(updatedUser));

    // Sync to Supabase database (skip for demo user id)
    if (userType === 'student' && user.id !== '10000000-0000-0000-0000-000000000001') {
      try {
        const { error } = await supabase
          .from('students')
          .update({ current_class: classId, current_subject: subjectCode })
          .eq('id', user.id);
        
        if (error) {
          console.warn('Supabase sync warning (could be offline or policy restriction):', error.message);
        }
      } catch (error) {
        console.error('Error syncing class/subject to database:', error);
      }
    }
  };

  const logout = () => {
    setUser(null);
    setUserType(null);
    localStorage.removeItem('featuredesk_user');
    localStorage.removeItem('featuredesk_user_type');
  };

  const value = {
    user,
    userType,
    login,
    loginAsDemo,
    logout,
    setClassSubject,
    loading
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}