import React, { useState, useEffect, useRef } from 'react';
import { Upload, Search, FileVideo, FileAudio, FileText, Loader2, Trash2, PlayCircle, File as FileIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type FileStatus = 'PROCESSING' | 'ACTIVE' | 'FAILED';

interface UploadedFile {
  id: number;
  filename: string;
  originalName: string;
  mimeType: string;
  geminiUri: string;
  geminiName: string;
  status: FileStatus;
  createdAt: string;
}

export default function App() {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchFiles = async () => {
    try {
      const res = await fetch('/api/files');
      const data = await res.json();
      setFiles(data);
    } catch (error) {
      console.error('Failed to fetch files:', error);
    }
  };

  useEffect(() => {
    fetchFiles();
    
    // Poll for status updates on processing files
    const interval = setInterval(() => {
      setFiles(currentFiles => {
        const hasProcessing = currentFiles.some(f => f.status === 'PROCESSING');
        if (hasProcessing) {
          fetchFiles();
        }
        return currentFiles;
      });
    }, 5000);
    
    return () => clearInterval(interval);
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      await fetchFiles();
    } catch (error) {
      console.error('Upload failed:', error);
      alert('Failed to upload file.');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this file?')) return;
    
    try {
      await fetch(`/api/files/${id}`, { method: 'DELETE' });
      await fetchFiles();
    } catch (error) {
      console.error('Delete failed:', error);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    const activeFiles = files.filter(f => f.status === 'ACTIVE');
    if (activeFiles.length === 0) {
      alert('No active files available for search. Please upload files and wait for them to process.');
      return;
    }

    setIsSearching(true);
    setSearchResults(null);

    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: searchQuery,
          fileIds: activeFiles.map(f => f.id)
        }),
      });
      
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      
      setSearchResults(data.result);
    } catch (error) {
      console.error('Search failed:', error);
      alert('Search failed. Please try again.');
    } finally {
      setIsSearching(false);
    }
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith('video/')) return <FileVideo className="w-5 h-5 text-blue-500" />;
    if (mimeType.startsWith('audio/')) return <FileAudio className="w-5 h-5 text-amber-500" />;
    if (mimeType === 'application/pdf') return <FileText className="w-5 h-5 text-red-500" />;
    return <FileIcon className="w-5 h-5 text-gray-500" />;
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-emerald-500/30">
      <div className="max-w-6xl mx-auto px-6 py-12">
        <header className="mb-12">
          <h1 className="text-4xl font-bold tracking-tight text-white mb-2">
            Tactical<span className="text-emerald-500">Engine</span>
          </h1>
          <p className="text-zinc-400 text-lg">
            Multimodal RAG for advanced football analysis. Ingest match videos, press conferences, and tactical PDFs.
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column: Upload & Files */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-sm">
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <Upload className="w-5 h-5 text-emerald-500" />
                Ingest Media
              </h2>
              
              <div 
                className={cn(
                  "border-2 border-dashed border-zinc-700 rounded-xl p-8 text-center transition-colors",
                  "hover:border-emerald-500/50 hover:bg-zinc-800/50 cursor-pointer relative"
                )}
                onClick={() => fileInputRef.current?.click()}
              >
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  className="hidden" 
                  onChange={handleFileUpload}
                  accept="video/*,audio/*,application/pdf"
                />
                
                {isUploading ? (
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
                    <p className="text-sm text-zinc-400">Uploading to Gemini...</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <div className="p-3 bg-zinc-800 rounded-full">
                      <Upload className="w-6 h-6 text-zinc-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-zinc-200">Click to upload</p>
                      <p className="text-xs text-zinc-500 mt-1">MP4, MP3, WAV, PDF (Max 2GB)</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-sm">
              <h2 className="text-xl font-semibold mb-4">Knowledge Base</h2>
              
              <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                <AnimatePresence>
                  {files.length === 0 ? (
                    <p className="text-sm text-zinc-500 text-center py-4">No files ingested yet.</p>
                  ) : (
                    files.map(file => (
                      <motion.div 
                        key={file.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="flex items-center justify-between p-3 bg-zinc-950 border border-zinc-800 rounded-xl group"
                      >
                        <div className="flex items-center gap-3 overflow-hidden">
                          {getFileIcon(file.mimeType)}
                          <div className="truncate">
                            <p className="text-sm font-medium text-zinc-200 truncate" title={file.originalName}>
                              {file.originalName}
                            </p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className={cn(
                                "text-[10px] px-1.5 py-0.5 rounded-sm font-medium uppercase tracking-wider",
                                file.status === 'ACTIVE' ? "bg-emerald-500/10 text-emerald-400" :
                                file.status === 'PROCESSING' ? "bg-amber-500/10 text-amber-400" :
                                "bg-red-500/10 text-red-400"
                              )}>
                                {file.status}
                              </span>
                            </div>
                          </div>
                        </div>
                        <button 
                          onClick={() => handleDelete(file.id)}
                          className="p-2 text-zinc-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                          title="Delete file"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </motion.div>
                    ))
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>

          {/* Right Column: Search & Results */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-sm">
              <form onSubmit={handleSearch} className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Search className="h-5 w-5 text-zinc-500" />
                </div>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="e.g., Show me all instances of playing out from the back under a high press..."
                  className="block w-full pl-11 pr-32 py-4 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all"
                />
                <div className="absolute inset-y-0 right-2 flex items-center">
                  <button
                    type="submit"
                    disabled={isSearching || !searchQuery.trim()}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                  >
                    {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}
                    Analyze
                  </button>
                </div>
              </form>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-sm min-h-[500px]">
              <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
                Analysis Results
              </h2>
              
              {isSearching ? (
                <div className="flex flex-col items-center justify-center h-64 space-y-4">
                  <div className="relative">
                    <div className="w-16 h-16 border-4 border-zinc-800 rounded-full"></div>
                    <div className="w-16 h-16 border-4 border-emerald-500 rounded-full border-t-transparent animate-spin absolute top-0 left-0"></div>
                  </div>
                  <p className="text-zinc-400 animate-pulse">Analyzing multimodal sources...</p>
                </div>
              ) : searchResults ? (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="prose prose-invert prose-emerald max-w-none"
                >
                  <div dangerouslySetInnerHTML={{ __html: formatMarkdown(searchResults) }} />
                </motion.div>
              ) : (
                <div className="flex flex-col items-center justify-center h-64 text-zinc-500">
                  <Search className="w-12 h-12 mb-4 opacity-20" />
                  <p>Enter a tactical query to search across your ingested media.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Simple markdown formatter for the results
function formatMarkdown(text: string) {
  let html = text
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/gim, '<em>$1</em>')
    .replace(/\[(.*?)\]\((.*?)\)/gim, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-emerald-400 hover:underline">$1</a>')
    .replace(/\n$/gim, '<br />')
    .replace(/^\> (.*$)/gim, '<blockquote class="border-l-4 border-emerald-500 pl-4 py-1 my-4 bg-zinc-950/50 rounded-r-lg italic text-zinc-300">$1</blockquote>');

  // Handle lists
  html = html.replace(/^\s*\- (.*$)/gim, '<li class="ml-4 list-disc">$1</li>');
  
  // Wrap consecutive li tags in ul
  html = html.replace(/(<li.*?>.*?<\/li>)(?:\n|<br \/>)*(?!<li)/gim, '$1</ul>');
  html = html.replace(/(?<!<\/li>)(?:\n|<br \/>)*(<li.*?>)/gim, '<ul class="my-4 space-y-2">$1');
  
  // Handle timestamps like [12:34] or 12:34
  html = html.replace(/\[?(\d{1,2}:\d{2}(?::\d{2})?)\]?/g, '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 cursor-pointer hover:bg-emerald-500/30 transition-colors mx-1">â± $1</span>');

  return html.replace(/\n/g, '<br />');
}

