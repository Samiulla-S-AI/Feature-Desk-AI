export const cloudinaryService = {
    cloudName: import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || '',
    uploadPreset: import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || '',

    /**
     * Determines the Cloudinary resource_type based on file MIME type or extension.
     * - 'image' for images (jpg, png, gif, webp, svg, etc.)
     * - 'raw' for PDFs, documents, JSON, and other non-media files
     * - 'video' for video files
     * - 'auto' as fallback (Cloudinary auto-detects)
     */
    _getResourceType(file: File | Blob): 'image' | 'raw' | 'video' | 'auto' {
        const mimeType = file.type?.toLowerCase() || '';

        // Images → 'image'
        if (mimeType.startsWith('image/')) {
            return 'image';
        }

        // Videos → 'video'
        if (mimeType.startsWith('video/')) {
            return 'video';
        }

        // PDFs, Documents, JSON, Text → 'raw'
        if (
            mimeType === 'application/pdf' ||
            mimeType === 'application/json' ||
            mimeType === 'application/msword' ||
            mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
            mimeType === 'text/plain' ||
            mimeType === 'text/markdown' ||
            mimeType === 'application/vnd.ms-excel' ||
            mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
            mimeType === 'application/vnd.ms-powerpoint' ||
            mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
        ) {
            return 'raw';
        }

        // Fallback for Blobs without MIME type (e.g., canvas exports)
        // 'auto' lets Cloudinary decide
        return 'auto';
    },

    /**
     * Uploads a file to Cloudinary using Unsigned Upload.
     * Automatically determines the correct resource_type (image/raw/video/auto)
     * based on the file's MIME type.
     *
     * @param file The file object (or Blob) to upload.
     * @param folder Optional folder path (e.g., 'exam-submissions').
     * @returns The secure URL of the uploaded file.
     */
    async uploadFile(file: File | Blob, folder: string = 'general'): Promise<string> {
        try {
            const resourceType = this._getResourceType(file);

            const formData = new FormData();
            formData.append('file', file);
            formData.append('upload_preset', this.uploadPreset);
            formData.append('folder', folder);

            // IMPORTANT: resource_type is part of the URL path, NOT a form field
            // e.g., /v1_1/{cloud_name}/raw/upload for PDFs/docs
            //        /v1_1/{cloud_name}/auto/upload for images (auto-detect)
            const response = await fetch(
                `https://api.cloudinary.com/v1_1/${this.cloudName}/${resourceType}/upload`,
                {
                    method: 'POST',
                    body: formData
                }
            );

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error?.message || 'Upload failed');
            }

            const data = await response.json();
            console.log(`✅ Uploaded to Cloudinary (${resourceType}):`, data.secure_url);
            return data.secure_url;
        } catch (error) {
            console.error('❌ Cloudinary Upload Error:', error);
            throw error;
        }
    },

    /**
     * Uses 'raw' resource_type which is standard for non-media files.
     *
     * @param file The PDF file to upload.
     * @param folder Optional folder path.
     * @returns The secure URL of the uploaded PDF.
     */
    async uploadPdf(file: File | Blob, folder: string = 'pdfs'): Promise<string> {
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('upload_preset', this.uploadPreset);
            formData.append('folder', folder);

            // PDFs MUST use 'raw' resource type in the URL path
            const response = await fetch(
                `https://api.cloudinary.com/v1_1/${this.cloudName}/raw/upload`,
                {
                    method: 'POST',
                    body: formData
                }
            );

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error?.message || 'PDF Upload failed');
            }

            const data = await response.json();
            console.log('✅ PDF Uploaded to Cloudinary:', data.secure_url);
            return data.secure_url;
        } catch (error) {
            console.error('❌ Cloudinary PDF Upload Error:', error);
            throw error;
        }
    },

    /**
     * Uploads a document (Word, Excel, PPT, etc.) to Cloudinary.
     * Uses 'raw' resource_type which is required for non-media files.
     *
     * @param file The document file to upload.
     * @param folder Optional folder path.
     * @returns The secure URL of the uploaded document.
     */
    async uploadDocument(file: File | Blob, folder: string = 'documents'): Promise<string> {
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('upload_preset', this.uploadPreset);
            formData.append('folder', folder);

            // Documents MUST use 'raw' resource type
            const response = await fetch(
                `https://api.cloudinary.com/v1_1/${this.cloudName}/raw/upload`,
                {
                    method: 'POST',
                    body: formData
                }
            );

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error?.message || 'Document Upload failed');
            }

            const data = await response.json();
            console.log('✅ Document Uploaded to Cloudinary:', data.secure_url);
            return data.secure_url;
        } catch (error) {
            console.error('❌ Cloudinary Document Upload Error:', error);
            throw error;
        }
    },

    /**
     * Uploads a JSON object as a file to Cloudinary.
     * Converts JSON to a Blob and uploads as a 'raw' resource type.
     */
    async uploadJson(data: any, folder: string = 'json_data'): Promise<string> {
        try {
            const jsonString = JSON.stringify(data);
            const blob = new Blob([jsonString], { type: 'application/json' });

            const formData = new FormData();
            formData.append('file', blob, `data_${Date.now()}.json`);
            formData.append('upload_preset', this.uploadPreset);
            formData.append('folder', folder);

            // JSON files MUST use 'raw' resource type in the URL path
            // (NOT as a form field — Cloudinary ignores resource_type in form data)
            const response = await fetch(
                `https://api.cloudinary.com/v1_1/${this.cloudName}/raw/upload`,
                {
                    method: 'POST',
                    body: formData
                }
            );

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error?.message || 'JSON Upload failed');
            }

            const result = await response.json();
            console.log('✅ JSON Uploaded to Cloudinary:', result.secure_url);
            return result.secure_url;
        } catch (error) {
            console.error('❌ Cloudinary JSON Upload Error:', error);
            throw error;
        }
    }
};
