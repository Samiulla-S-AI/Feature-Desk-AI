import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
    Upload,
    FileText,
    Image,
    Folder,
    Search,
    Grid,
    List,
    Trash2,
    Download,
    Eye,
    Plus,
    X,
    Loader,
    BookOpen
} from 'lucide-react';
import { saveUploadedContent, getTeacherContent } from '../../lib/teacherDb';
import { cloudinaryService } from '../../lib/cloudinaryService';
import { fileToBase64 } from '../../lib/pdfProcessor';
import { extractTextFromPDF } from '../../lib/contentAI';

interface ContentItem {
    id: string;
    title: string;
    subject: string;
    type: 'pdf' | 'image' | 'notes';
    fileUrl: string;
    uploaded_at: string;
}

interface ContentManagerProps {
    subjectCode?: string;
    classId?: number;
}

export default function ContentManager({ subjectCode, classId }: ContentManagerProps) {
    const { user } = useAuth();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [content, setContent] = useState<ContentItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedType, setSelectedType] = useState<'all' | 'pdf' | 'image' | 'notes'>('all');
    const [showUploadModal, setShowUploadModal] = useState(false);
    const [uploadData, setUploadData] = useState({
        title: '',
        type: 'notes' as 'pdf' | 'image' | 'notes',
        subject: subjectCode || '',
        file: null as File | null
    });

    // Mock content for demo
    const mockContent: ContentItem[] = [
        { id: '1', title: 'Chapter 1 - Introduction to Algebra', subject: 'MATH', type: 'pdf', fileUrl: '#', uploaded_at: '2024-01-15' },
        { id: '2', title: 'Photosynthesis Diagram', subject: 'SCI', type: 'image', fileUrl: '#', uploaded_at: '2024-01-14' },
        { id: '3', title: 'English Grammar Notes', subject: 'ENG', type: 'notes', fileUrl: '#', uploaded_at: '2024-01-13' },
        { id: '4', title: 'Historical Timeline', subject: 'HIST', type: 'pdf', fileUrl: '#', uploaded_at: '2024-01-12' },
        { id: '5', title: 'Physics Formulas', subject: 'PHY', type: 'notes', fileUrl: '#', uploaded_at: '2024-01-11' },
        { id: '6', title: 'Lab Experiment Setup', subject: 'SCI', type: 'image', fileUrl: '#', uploaded_at: '2024-01-10' },
    ];

    useEffect(() => {
        loadContent();
    }, []);

    const loadContent = async () => {
        setLoading(true);
        const data = await getTeacherContent(user?.id || '');
        setContent(data.length > 0 ? data : mockContent);
        setLoading(false);
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setUploadData(prev => ({
                ...prev,
                file,
                title: file.name.replace(/\.[^/.]+$/, ''),
                type: file.type.includes('pdf') ? 'pdf' : file.type.includes('image') ? 'image' : 'notes'
            }));
        }
    };

    const handleUpload = async () => {
        if (!uploadData.file || !uploadData.title.trim()) {
            alert('Please provide a title and select a file');
            return;
        }

        setUploading(true);

        try {
            // Upload to Cloudinary using the appropriate method based on file type
            // PDFs → uploadPdf (uses /raw/upload endpoint)
            // Documents (.doc, .docx, .txt) → uploadDocument (uses /raw/upload endpoint)
            // Images → uploadFile (uses /auto/upload endpoint)
            let uploadedUrl: string;
            const fileType = uploadData.file.type?.toLowerCase() || '';
            const fileName = uploadData.file.name?.toLowerCase() || '';

            if (uploadData.type === 'pdf' || fileType === 'application/pdf' || fileName.endsWith('.pdf')) {
                uploadedUrl = await cloudinaryService.uploadPdf(uploadData.file, 'teacher_content/pdfs');
            } else if (
                fileType.includes('msword') ||
                fileType.includes('wordprocessingml') ||
                fileType === 'text/plain' ||
                fileType === 'text/markdown' ||
                fileName.endsWith('.doc') ||
                fileName.endsWith('.docx') ||
                fileName.endsWith('.txt') ||
                fileName.endsWith('.md')
            ) {
                uploadedUrl = await cloudinaryService.uploadDocument(uploadData.file, 'teacher_content/documents');
            } else {
                // Images and other files — auto-detect works
                uploadedUrl = await cloudinaryService.uploadFile(uploadData.file, 'teacher_content/images');
            }

            // Extract text content from the file if it's a PDF or notes
            let extractedText = '';
            try {
                if (uploadData.type === 'pdf' || fileType === 'application/pdf' || fileName.endsWith('.pdf')) {
                    const base64 = await fileToBase64(uploadData.file);
                    const pdfTextResult = await extractTextFromPDF(base64);
                    if (pdfTextResult.success) {
                        extractedText = pdfTextResult.text;
                    }
                } else if (
                    uploadData.type === 'notes' || 
                    fileType === 'text/plain' || 
                    fileType === 'text/markdown' || 
                    fileName.endsWith('.txt') || 
                    fileName.endsWith('.md')
                ) {
                    extractedText = await new Promise<string>((resolve) => {
                        const reader = new FileReader();
                        reader.onload = (event) => {
                            resolve(event.target?.result as string || '');
                        };
                        reader.readAsText(uploadData.file!);
                    });
                }
            } catch (err) {
                console.error('Error extracting text for AI processing:', err);
            }

            // Save metadata to Supabase
            const result = await saveUploadedContent(user?.id || '', {
                title: uploadData.title,
                subject: uploadData.subject || 'General',
                classId: classId || 0,
                type: uploadData.type,
                fileUrl: uploadedUrl,
                extractedText: extractedText
            });

            if (result.success) {
                await loadContent();
                setShowUploadModal(false);
                setUploadData({ title: '', type: 'notes', subject: subjectCode || '', file: null });
            }
        } catch (error) {
            console.error('Upload error:', error);
            alert('Failed to upload content. Please check your file and try again.');
        }

        setUploading(false);
    };

    const filteredContent = content.filter(item => {
        const matchesSearch = item.title.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesType = selectedType === 'all' || item.type === selectedType;
        const matchesSubject = !subjectCode || item.subject === subjectCode;
        return matchesSearch && matchesType && matchesSubject;
    });

    const getTypeIcon = (type: string) => {
        switch (type) {
            case 'pdf': return <FileText className="w-6 h-6 text-red-500" />;
            case 'image': return <Image className="w-6 h-6 text-blue-500" />;
            case 'notes': return <BookOpen className="w-6 h-6 text-green-500" />;
            default: return <Folder className="w-6 h-6 text-gray-500" />;
        }
    };

    const getTypeColor = (type: string) => {
        switch (type) {
            case 'pdf': return 'bg-red-100 text-red-800';
            case 'image': return 'bg-blue-100 text-blue-800';
            case 'notes': return 'bg-green-100 text-green-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-bold text-gray-900">Content Manager</h2>
                    <p className="text-gray-600">
                        {subjectCode ? `${subjectCode} Materials` : 'All Teaching Materials'}
                    </p>
                </div>
                <button
                    onClick={() => setShowUploadModal(true)}
                    className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                    <Plus className="w-4 h-4" />
                    <span>Upload Content</span>
                </button>
            </div>

            {/* Search and Filters */}
            <div className="flex flex-col md:flex-row items-start md:items-center space-y-4 md:space-y-0 md:space-x-4">
                <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Search content..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                </div>

                <div className="flex items-center space-x-2">
                    <select
                        value={selectedType}
                        onChange={(e) => setSelectedType(e.target.value as any)}
                        className="px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500"
                    >
                        <option value="all">All Types</option>
                        <option value="pdf">PDFs</option>
                        <option value="image">Images</option>
                        <option value="notes">Notes</option>
                    </select>

                    <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden">
                        <button
                            onClick={() => setViewMode('grid')}
                            className={`p-3 ${viewMode === 'grid' ? 'bg-blue-50 text-blue-600' : 'text-gray-500 hover:bg-gray-50'}`}
                        >
                            <Grid className="w-5 h-5" />
                        </button>
                        <button
                            onClick={() => setViewMode('list')}
                            className={`p-3 ${viewMode === 'list' ? 'bg-blue-50 text-blue-600' : 'text-gray-500 hover:bg-gray-50'}`}
                        >
                            <List className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Content Grid/List */}
            {loading ? (
                <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                </div>
            ) : filteredContent.length === 0 ? (
                <div className="bg-white rounded-xl shadow-sm border p-12 text-center">
                    <Folder className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">No Content Found</h3>
                    <p className="text-gray-600 mb-4">Upload your first teaching material to get started</p>
                    <button
                        onClick={() => setShowUploadModal(true)}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                        Upload Content
                    </button>
                </div>
            ) : viewMode === 'grid' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredContent.map((item) => (
                        <div
                            key={item.id}
                            className="bg-white rounded-xl shadow-sm border p-4 hover:shadow-md transition-shadow"
                        >
                            <div className="flex items-start justify-between mb-3">
                                <div className="flex items-center space-x-3">
                                    <div className="p-2 bg-gray-50 rounded-lg">
                                        {getTypeIcon(item.type)}
                                    </div>
                                    <div>
                                        <h4 className="font-medium text-gray-900 line-clamp-1">{item.title}</h4>
                                        <p className="text-xs text-gray-500">{item.subject}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center justify-between">
                                <span className={`px-2 py-1 text-xs font-medium rounded ${getTypeColor(item.type)}`}>
                                    {item.type.toUpperCase()}
                                </span>
                                <span className="text-xs text-gray-500">
                                    {new Date(item.uploaded_at).toLocaleDateString()}
                                </span>
                            </div>

                            <div className="flex items-center space-x-2 mt-4 pt-4 border-t">
                                <button className="flex-1 flex items-center justify-center space-x-1 py-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                                    <Eye className="w-4 h-4" />
                                    <span className="text-sm">View</span>
                                </button>
                                <button className="flex-1 flex items-center justify-center space-x-1 py-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors">
                                    <Download className="w-4 h-4" />
                                    <span className="text-sm">Download</span>
                                </button>
                                <button className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Title
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Type
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Subject
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Uploaded
                                </th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Actions
                                </th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {filteredContent.map((item) => (
                                <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex items-center space-x-3">
                                            {getTypeIcon(item.type)}
                                            <span className="font-medium text-gray-900">{item.title}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`px-2 py-1 text-xs font-medium rounded ${getTypeColor(item.type)}`}>
                                            {item.type.toUpperCase()}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-gray-500">
                                        {item.subject}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-gray-500 text-sm">
                                        {new Date(item.uploaded_at).toLocaleDateString()}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right">
                                        <div className="flex items-center justify-end space-x-2">
                                            <button className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                                                <Eye className="w-4 h-4" />
                                            </button>
                                            <button className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors">
                                                <Download className="w-4 h-4" />
                                            </button>
                                            <button className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Upload Modal */}
            {showUploadModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
                        <div className="p-6 border-b flex items-center justify-between">
                            <h3 className="text-lg font-bold text-gray-900">Upload Content</h3>
                            <button
                                onClick={() => setShowUploadModal(false)}
                                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-6 space-y-4">
                            {/* File Drop Zone */}
                            <div
                                onClick={() => fileInputRef.current?.click()}
                                className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-all"
                            >
                                {uploadData.file ? (
                                    <div className="flex items-center justify-center space-x-3">
                                        {getTypeIcon(uploadData.type)}
                                        <span className="font-medium text-gray-900">{uploadData.file.name}</span>
                                    </div>
                                ) : (
                                    <>
                                        <Upload className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                                        <p className="text-gray-600">Click to select a file</p>
                                        <p className="text-xs text-gray-400 mt-1">PDF, Images, or Documents</p>
                                    </>
                                )}
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.txt,.md"
                                    onChange={handleFileSelect}
                                    className="hidden"
                                />
                            </div>

                            {/* Title */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Title
                                </label>
                                <input
                                    type="text"
                                    value={uploadData.title}
                                    onChange={(e) => setUploadData(prev => ({ ...prev, title: e.target.value }))}
                                    placeholder="Enter content title"
                                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                />
                            </div>

                            {/* Type */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Content Type
                                </label>
                                <select
                                    value={uploadData.type}
                                    onChange={(e) => setUploadData(prev => ({ ...prev, type: e.target.value as any }))}
                                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500"
                                >
                                    <option value="pdf">PDF Document</option>
                                    <option value="image">Image</option>
                                    <option value="notes">Notes</option>
                                </select>
                            </div>

                            {/* Subject */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Subject
                                </label>
                                <select
                                    value={uploadData.subject}
                                    onChange={(e) => setUploadData(prev => ({ ...prev, subject: e.target.value }))}
                                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500"
                                >
                                    <option value="">Select Subject</option>
                                    <option value="MATH">Mathematics</option>
                                    <option value="SCI">Science</option>
                                    <option value="ENG">English</option>
                                    <option value="HIST">History</option>
                                    <option value="PHY">Physics</option>
                                </select>
                            </div>
                        </div>

                        <div className="p-6 border-t flex space-x-3">
                            <button
                                onClick={() => setShowUploadModal(false)}
                                className="flex-1 py-2 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleUpload}
                                disabled={uploading || !uploadData.file}
                                className="flex-1 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                            >
                                {uploading ? (
                                    <>
                                        <Loader className="w-4 h-4 animate-spin" />
                                        <span>Uploading...</span>
                                    </>
                                ) : (
                                    <>
                                        <Upload className="w-4 h-4" />
                                        <span>Upload</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
