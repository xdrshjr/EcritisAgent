/**
 * ImageInsertDialog Component
 * Provides UI for searching and inserting images into the editor
 * Features:
 * - Search images from Unsplash
 * - Upload local images
 * - Paginated image gallery (20 per page)
 * - Image selection and insertion
 */

'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { X, Search, Upload, Loader2, ChevronLeft, ChevronRight, Image as ImageIcon, AlertCircle } from 'lucide-react';
import { logger } from '@/lib/logger';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { buildFlaskApiUrl } from '@/lib/flaskConfig';

interface ImageInsertDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onInsertImage: (imageUrl: string) => void;
}

interface ImageResult {
  id: string;
  url: string;
  description: string;
  author: string;
}

const IMAGES_PER_PAGE = 20;

const ImageInsertDialog = ({ isOpen, onClose, onInsertImage }: ImageInsertDialogProps) => {
  const { locale } = useLanguage();
  const dict = getDictionary(locale);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [images, setImages] = useState<ImageResult[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState<string>('');
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('');
      setImages([]);
      setCurrentPage(1);
      setTotalPages(1);
      setError('');
      setDragActive(false);
    }
  }, [isOpen]);

  // Search images from Unsplash
  const handleSearch = useCallback(async (query: string, page: number = 1) => {
    if (!query.trim()) {
      logger.warn('Empty search query provided', undefined, 'ImageInsertDialog');
      return;
    }

    setIsSearching(true);
    setError('');
    logger.info('Starting image search', { query, page }, 'ImageInsertDialog');

    try {
      const flaskUrl = buildFlaskApiUrl('/api/image-services/search');
      const response = await fetch(flaskUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: query.trim(),
          perPage: IMAGES_PER_PAGE,
          page: page,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error || `HTTP ${response.status}`;
        logger.error('Image search failed', { 
          status: response.status, 
          error: errorMessage 
        }, 'ImageInsertDialog');
        setError(errorMessage);
        setImages([]);
        return;
      }

      const data = await response.json();
      
      if (!data.success) {
        logger.error('Image search returned error', { error: data.error }, 'ImageInsertDialog');
        setError(data.error || 'Search failed');
        setImages([]);
        return;
      }

      const searchResults: ImageResult[] = data.images || [];
      const total = data.total || searchResults.length;
      const totalPagesFromApi = data.totalPages || Math.ceil(total / IMAGES_PER_PAGE);

      logger.success('Image search completed', {
        query,
        page,
        resultCount: searchResults.length,
        total,
        totalPages: totalPagesFromApi,
      }, 'ImageInsertDialog');

      setImages(searchResults);
      setCurrentPage(page);
      setTotalPages(totalPagesFromApi);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Image search request failed', { error: errorMessage }, 'ImageInsertDialog');
      setError(errorMessage);
      setImages([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  // Handle search form submission
  const handleSearchSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      handleSearch(searchQuery.trim(), 1);
    }
  }, [searchQuery, handleSearch]);

  // Handle page navigation
  const handlePreviousPage = useCallback(() => {
    if (currentPage > 1 && searchQuery.trim()) {
      const newPage = currentPage - 1;
      setCurrentPage(newPage);
      handleSearch(searchQuery.trim(), newPage);
    }
  }, [currentPage, searchQuery, handleSearch]);

  const handleNextPage = useCallback(() => {
    if (currentPage < totalPages && searchQuery.trim()) {
      const newPage = currentPage + 1;
      setCurrentPage(newPage);
      handleSearch(searchQuery.trim(), newPage);
    }
  }, [currentPage, totalPages, searchQuery, handleSearch]);

  // Handle image selection
  const handleSelectImage = useCallback((imageUrl: string) => {
    logger.info('Image selected for insertion', { imageUrl }, 'ImageInsertDialog');
    onInsertImage(imageUrl);
    onClose();
  }, [onInsertImage, onClose]);

  // Handle file upload
  const handleFileUpload = useCallback(async (file: File) => {
    // Validate file type
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      logger.warn('Invalid file type uploaded', { fileType: file.type }, 'ImageInsertDialog');
      setError(dict.docValidation.imageInsert.uploadError + ': Invalid file type');
      return;
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      logger.warn('File too large', { fileSize: file.size }, 'ImageInsertDialog');
      setError(dict.docValidation.imageInsert.uploadError + ': File too large (max 10MB)');
      return;
    }

    setIsUploading(true);
    setError('');
    logger.info('Starting image upload', { fileName: file.name, fileSize: file.size }, 'ImageInsertDialog');

    try {
      // Convert file to data URL
      const reader = new FileReader();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      logger.success('Image uploaded successfully', { fileName: file.name }, 'ImageInsertDialog');
      handleSelectImage(dataUrl);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Image upload failed', { error: errorMessage }, 'ImageInsertDialog');
      setError(dict.docValidation.imageInsert.uploadError + ': ' + errorMessage);
    } finally {
      setIsUploading(false);
    }
  }, [handleSelectImage, dict]);

  // Handle file input change
  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [handleFileUpload]);

  // Handle drag and drop
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const file = e.dataTransfer.files?.[0];
    if (file) {
      logger.info('File dropped', { fileName: file.name }, 'ImageInsertDialog');
      handleFileUpload(file);
    }
  }, [handleFileUpload]);

  // Handle upload button click
  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-background border border-border shadow-lg rounded-lg w-[90vw] max-w-4xl h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-xl font-semibold text-foreground">
            {dict.docValidation.imageInsert.title}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-muted rounded-md transition-colors"
            aria-label={dict.docValidation.imageInsert.close}
            tabIndex={0}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search and Upload Section */}
        <div className="p-4 border-b border-border space-y-4">
          {/* Search Form */}
          <form onSubmit={handleSearchSubmit} className="flex gap-2">
            <div className="flex-1">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={dict.docValidation.imageInsert.searchPlaceholder}
                className="w-full px-4 py-2 border border-border bg-background rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
                disabled={isSearching}
              />
            </div>
            <button
              type="submit"
              disabled={isSearching || !searchQuery.trim()}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {isSearching ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{dict.docValidation.imageInsert.loading}</span>
                </>
              ) : (
                <>
                  <Search className="w-4 h-4" />
                  <span>{dict.docValidation.imageInsert.searchResults}</span>
                </>
              )}
            </button>
          </form>

          {/* Upload Section */}
          <div
            className={`border border-dashed rounded-md p-4 transition-colors ${
              dragActive
                ? 'border-primary bg-primary/10'
                : 'border-border hover:border-primary/50'
            }`}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            <div className="flex flex-col items-center gap-2">
              <Upload className="w-8 h-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground text-center">
                {dict.docValidation.imageInsert.uploadHint}
              </p>
              <p className="text-xs text-muted-foreground">
                {dict.docValidation.imageInsert.supportedFormats}
              </p>
              <button
                onClick={handleUploadClick}
                disabled={isUploading}
                className="mt-2 px-4 py-2 bg-card border border-border rounded-md hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{dict.docValidation.imageInsert.loading}</span>
                  </>
                ) : (
                  <>
                    <ImageIcon className="w-4 h-4" />
                    <span>{dict.docValidation.imageInsert.uploadImage}</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Hidden File Input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
            onChange={handleFileInputChange}
            className="hidden"
          />
        </div>

        {/* Error Message */}
        {error && (
          <div className="mx-4 mt-4 p-3 bg-destructive/10 border border-destructive/50 rounded-md flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-destructive" />
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {/* Image Gallery */}
        <div className="flex-1 overflow-auto p-4">
          {images.length === 0 && !isSearching && !error && (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <ImageIcon className="w-16 h-16 mb-4 opacity-50" />
              <p className="text-lg">{dict.docValidation.imageInsert.noResults}</p>
              <p className="text-sm mt-2">Search for images or upload your own</p>
            </div>
          )}

          {images.length > 0 && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {images.map((image) => (
                  <div
                    key={image.id}
                    className="group relative aspect-square border border-border rounded-md overflow-hidden hover:border-primary transition-colors cursor-pointer"
                    onClick={() => handleSelectImage(image.url)}
                  >
                    <img
                      src={image.url}
                      alt={image.description || 'Image'}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                      <button
                        className="opacity-0 group-hover:opacity-100 px-4 py-2 bg-primary text-primary-foreground rounded-md transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectImage(image.url);
                        }}
                      >
                        {dict.docValidation.imageInsert.selectImage}
                      </button>
                    </div>
                    {image.description && (
                      <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-xs p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <p className="truncate">{image.description}</p>
                        {image.author && (
                          <p className="text-muted-foreground text-[10px] mt-1">
                            by {image.author}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-4 mt-6">
                  <button
                    onClick={handlePreviousPage}
                    disabled={currentPage === 1}
                    className="px-4 py-2 border border-border bg-card rounded-md hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span>{dict.docValidation.imageInsert.previousPage}</span>
                  </button>
                  <span className="text-sm text-muted-foreground">
                    {dict.docValidation.imageInsert.page} {currentPage} {dict.docValidation.imageInsert.of} {totalPages}
                  </span>
                  <button
                    onClick={handleNextPage}
                    disabled={currentPage === totalPages}
                    className="px-4 py-2 border border-border bg-card rounded-md hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                  >
                    <span>{dict.docValidation.imageInsert.nextPage}</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </>
          )}

          {isSearching && (
            <div className="flex items-center justify-center h-full">
              <div className="flex flex-col items-center gap-4">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="text-muted-foreground">{dict.docValidation.imageInsert.loading}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ImageInsertDialog;

