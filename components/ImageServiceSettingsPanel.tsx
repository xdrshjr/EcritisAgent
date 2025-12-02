/**
 * Image Service Settings Panel Component
 * Provides UI for configuring image services (e.g., Unsplash)
 * Features:
 * - Image service list with add/edit/delete operations
 * - API key management (multiple keys per service)
 * - Test image search functionality
 * - Default Unsplash service (non-deletable)
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { Save, Plus, Trash2, Edit2, X, Image as ImageIcon, Search, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { logger } from '@/lib/logger';
import {
  loadImageServiceConfigs,
  saveImageServiceConfigs,
  addImageServiceConfig,
  updateImageServiceConfig,
  deleteImageServiceConfig,
  type ImageServiceConfig,
  type ImageServiceConfigList,
} from '@/lib/imageServiceConfig';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { cn } from '@/lib/utils';
import { buildFlaskApiUrl } from '@/lib/flaskConfig';
import ConfirmDialog from './ConfirmDialog';

interface ImageServiceSettingsPanelProps {
  className?: string;
}

interface SearchResult {
  id: string;
  url: string;
  description: string;
  author: string;
}

const ImageServiceSettingsPanel = ({ className }: ImageServiceSettingsPanelProps) => {
  const { locale } = useLanguage();
  const dict = getDictionary(locale);
  
  const [services, setServices] = useState<ImageServiceConfig[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [serviceToDelete, setServiceToDelete] = useState<ImageServiceConfig | null>(null);
  
  // Form data
  const [formData, setFormData] = useState<{
    name: string;
    type: 'unsplash' | 'custom';
    apiKeys: string[];
  }>({
    name: '',
    type: 'unsplash',
    apiKeys: [''],
  });

  // Test search
  const [testSearchQuery, setTestSearchQuery] = useState<string>('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchError, setSearchError] = useState<string>('');

  // Load image service configurations on mount
  useEffect(() => {
    logger.component('ImageServiceSettingsPanel', 'mounted');
    handleLoadConfigs();
  }, []);

  // Load image service configurations
  const handleLoadConfigs = useCallback(async () => {
    logger.info('Loading image service configurations', undefined, 'ImageServiceSettingsPanel');
    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      const configList = await loadImageServiceConfigs();
      setServices(configList.imageServices || []);
      
      logger.success('Image service configurations loaded', {
        count: configList.imageServices.length,
      }, 'ImageServiceSettingsPanel');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load image service configurations';
      logger.error('Failed to load image service configurations', {
        error: errorMessage,
      }, 'ImageServiceSettingsPanel');
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Handle add new service
  const handleAdd = () => {
    logger.info('Starting to add new image service', undefined, 'ImageServiceSettingsPanel');
    setIsAdding(true);
    setEditingId(null);
    setFormData({
      name: '',
      type: 'unsplash',
      apiKeys: [''],
    });
    setError('');
    setSuccess('');
  };

  // Handle edit service
  const handleEdit = (service: ImageServiceConfig) => {
    logger.info('Starting to edit image service', { id: service.id, name: service.name }, 'ImageServiceSettingsPanel');
    setEditingId(service.id);
    setIsAdding(false);
    setFormData({
      name: service.name,
      type: service.type,
      apiKeys: service.apiKeys.length > 0 ? [...service.apiKeys] : [''],
    });
    setError('');
    setSuccess('');
  };

  // Handle cancel edit/add
  const handleCancel = () => {
    logger.debug('Canceling image service edit/add', undefined, 'ImageServiceSettingsPanel');
    setEditingId(null);
    setIsAdding(false);
    setFormData({
      name: '',
      type: 'unsplash',
      apiKeys: [''],
    });
    setError('');
    setSuccess('');
  };

  // Handle save service
  const handleSave = async () => {
    if (!formData.name || !formData.name.trim()) {
      setError(dict.settings.imageServiceNameRequired || 'Service name is required');
      return;
    }

    if (!formData.apiKeys || formData.apiKeys.length === 0 || formData.apiKeys.every(key => !key.trim())) {
      setError(dict.settings.imageServiceApiKeyRequired || 'At least one API key is required');
      return;
    }

    // Filter out empty API keys
    const validApiKeys = formData.apiKeys.filter(key => key.trim().length > 0);

    logger.info('Saving image service configuration', {
      isAdding,
      editingId,
      name: formData.name,
      type: formData.type,
      apiKeyCount: validApiKeys.length,
    }, 'ImageServiceSettingsPanel');

    setIsSaving(true);
    setError('');
    setSuccess('');

    try {
      if (isAdding) {
        const result = await addImageServiceConfig({
          name: formData.name.trim(),
          type: formData.type,
          apiKeys: validApiKeys,
          isDeletable: true,
        });

        if (result.success && result.service) {
          logger.success('Image service added successfully', {
            id: result.service.id,
            name: result.service.name,
          }, 'ImageServiceSettingsPanel');
          
          setSuccess(dict.settings.imageServiceSaveSuccess || 'Image service saved successfully');
          await handleLoadConfigs();
          handleCancel();
          
          setTimeout(() => setSuccess(''), 3000);
        } else {
          throw new Error(result.error || 'Failed to add image service');
        }
      } else if (editingId) {
        const result = await updateImageServiceConfig(editingId, {
          name: formData.name.trim(),
          type: formData.type,
          apiKeys: validApiKeys,
        });

        if (result.success) {
          logger.success('Image service updated successfully', {
            id: editingId,
          }, 'ImageServiceSettingsPanel');
          
          setSuccess(dict.settings.imageServiceSaveSuccess || 'Image service saved successfully');
          await handleLoadConfigs();
          handleCancel();
          
          setTimeout(() => setSuccess(''), 3000);
        } else {
          throw new Error(result.error || 'Failed to update image service');
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to save image service';
      logger.error('Failed to save image service', {
        error: errorMessage,
      }, 'ImageServiceSettingsPanel');
      setError(errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  // Handle delete service
  const handleDelete = async (service: ImageServiceConfig) => {
    if (!service.isDeletable) {
      setError(dict.settings.imageServiceCannotDelete || 'This service cannot be deleted');
      return;
    }

    logger.info('Deleting image service', { id: service.id, name: service.name }, 'ImageServiceSettingsPanel');
    
    try {
      const result = await deleteImageServiceConfig(service.id);
      
      if (result.success) {
        logger.success('Image service deleted successfully', {
          id: service.id,
          name: service.name,
        }, 'ImageServiceSettingsPanel');
        
        setSuccess(dict.settings.imageServiceDeleteSuccess || 'Image service deleted successfully');
        await handleLoadConfigs();
        setServiceToDelete(null);
        
        setTimeout(() => setSuccess(''), 3000);
      } else {
        throw new Error(result.error || 'Failed to delete image service');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete image service';
      logger.error('Failed to delete image service', {
        error: errorMessage,
      }, 'ImageServiceSettingsPanel');
      setError(errorMessage);
    }
  };

  // Handle add API key field
  const handleAddApiKey = () => {
    setFormData({
      ...formData,
      apiKeys: [...formData.apiKeys, ''],
    });
  };

  // Handle remove API key field
  const handleRemoveApiKey = (index: number) => {
    if (formData.apiKeys.length > 1) {
      setFormData({
        ...formData,
        apiKeys: formData.apiKeys.filter((_, i) => i !== index),
      });
    }
  };

  // Handle API key change
  const handleApiKeyChange = (index: number, value: string) => {
    const newApiKeys = [...formData.apiKeys];
    newApiKeys[index] = value;
    setFormData({
      ...formData,
      apiKeys: newApiKeys,
    });
  };

  // Handle test search
  const handleTestSearch = async () => {
    if (!testSearchQuery.trim()) {
      setSearchError(dict.settings.imageServiceSearchQueryRequired || 'Please enter a search query');
      return;
    }

    logger.info('Testing image search', {
      query: testSearchQuery,
    }, 'ImageServiceSettingsPanel');

    setIsSearching(true);
    setSearchError('');
    setSearchResults([]);

    try {
      const apiUrl = buildFlaskApiUrl('/api/image-services/search');
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: testSearchQuery.trim(),
          perPage: 3,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const result = await response.json();
      
      if (result.success && result.images) {
        logger.success('Image search completed', {
          query: testSearchQuery,
          resultCount: result.images.length,
        }, 'ImageServiceSettingsPanel');
        
        setSearchResults(result.images);
      } else {
        throw new Error(result.error || 'No images found');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to search images';
      logger.error('Image search failed', {
        error: errorMessage,
        query: testSearchQuery,
      }, 'ImageServiceSettingsPanel');
      setSearchError(errorMessage);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className={cn('h-full flex flex-col overflow-hidden bg-background', className)}>
      {/* Header */}
      <div className="flex-shrink-0 border-b-2 border-border bg-card p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold text-foreground mb-1">
              {dict.settings.imageServiceTitle || 'Image Services'}
            </h3>
            <p className="text-sm text-muted-foreground">
              {dict.settings.imageServiceDescription || 'Configure image services for searching and accessing images'}
            </p>
          </div>
          {!isAdding && !editingId && (
            <button
              onClick={handleAdd}
              className="px-4 py-2 bg-primary text-primary-foreground border-2 border-border hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none shadow-sm transition-all flex items-center gap-2 font-medium"
              aria-label={dict.settings.imageServiceAdd || 'Add Image Service'}
            >
              <Plus className="w-4 h-4" />
              <span>{dict.settings.imageServiceAdd || 'Add Service'}</span>
            </button>
          )}
        </div>

        {/* Messages */}
        {error && (
          <div className="mb-3 p-3 bg-destructive/10 border-2 border-destructive text-destructive-foreground text-sm rounded-md flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
        
        {success && (
          <div className="mb-3 p-3 bg-green-600/10 border-2 border-green-600 text-green-600 text-sm rounded-md flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {/* Test Search Section */}
        <div className="mt-4 p-4 bg-muted/50 border-2 border-border rounded-md">
          <div className="flex items-center gap-2 mb-3">
            <Search className="w-4 h-4 text-foreground" />
            <h4 className="text-sm font-semibold text-foreground">
              {dict.settings.imageServiceTestSearch || 'Test Image Search'}
            </h4>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={testSearchQuery}
              onChange={(e) => setTestSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isSearching) {
                  handleTestSearch();
                }
              }}
              placeholder={dict.settings.imageServiceSearchPlaceholder || 'Enter search query...'}
              className="flex-1 px-3 py-2 bg-background border-2 border-border text-foreground focus:outline-none focus:border-primary rounded-md text-sm"
              disabled={isSearching}
            />
            <button
              onClick={handleTestSearch}
              disabled={isSearching || !testSearchQuery.trim()}
              className="px-4 py-2 bg-primary text-primary-foreground border-2 border-border hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-medium"
            >
              {isSearching ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{dict.settings.imageServiceSearching || 'Searching...'}</span>
                </>
              ) : (
                <>
                  <Search className="w-4 h-4" />
                  <span>{dict.settings.imageServiceSearch || 'Search'}</span>
                </>
              )}
            </button>
          </div>
          
          {searchError && (
            <div className="mt-2 p-2 bg-destructive/10 border border-destructive text-destructive-foreground text-xs rounded">
              {searchError}
            </div>
          )}

          {/* Search Results */}
          {searchResults.length > 0 && (
            <div className="mt-4">
              <div className="grid grid-cols-3 gap-3">
                {searchResults.map((result) => (
                  <div
                    key={result.id}
                    className="relative aspect-video bg-muted border-2 border-border rounded-md overflow-hidden group"
                  >
                    <img
                      src={result.url}
                      alt={result.description || 'Search result'}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        logger.warn('Failed to load image', { url: result.url }, 'ImageServiceSettingsPanel');
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity p-2 flex flex-col justify-end">
                      <p className="text-xs text-white line-clamp-2">{result.description}</p>
                      <p className="text-xs text-white/80 mt-1">by {result.author}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Services List */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Add/Edit Form */}
        {(isAdding || editingId) && (
          <div className="mb-4 p-4 bg-card border-2 border-border rounded-md shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-md font-bold text-foreground">
                {isAdding
                  ? dict.settings.imageServiceAdd || 'Add Image Service'
                  : dict.settings.imageServiceEdit || 'Edit Image Service'}
              </h4>
              <button
                onClick={handleCancel}
                className="w-6 h-6 flex items-center justify-center hover:bg-muted rounded transition-colors"
                aria-label="Cancel"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  {dict.settings.imageServiceName || 'Service Name'}
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder={dict.settings.imageServiceNamePlaceholder || 'Enter service name...'}
                  className="w-full px-3 py-2 bg-background border-2 border-border text-foreground focus:outline-none focus:border-primary rounded-md text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  {dict.settings.imageServiceType || 'Service Type'}
                </label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value as 'unsplash' | 'custom' })}
                  className="w-full px-3 py-2 bg-background border-2 border-border text-foreground focus:outline-none focus:border-primary rounded-md text-sm"
                  disabled={editingId !== null && services.find(s => s.id === editingId)?.type === 'unsplash' && !services.find(s => s.id === editingId)?.isDeletable}
                >
                  <option value="unsplash">Unsplash</option>
                  <option value="custom">Custom</option>
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-medium text-foreground">
                    {dict.settings.imageServiceApiKeys || 'API Keys'} ({dict.settings.imageServiceApiKeysHint || 'Multiple keys for load balancing'})
                  </label>
                  <button
                    onClick={handleAddApiKey}
                    className="text-xs px-2 py-1 bg-muted hover:bg-accent text-foreground rounded transition-colors flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    <span>{dict.settings.imageServiceAddApiKey || 'Add Key'}</span>
                  </button>
                </div>
                <div className="space-y-2">
                  {formData.apiKeys.map((key, index) => (
                    <div key={index} className="flex gap-2">
                      <input
                        type="password"
                        value={key}
                        onChange={(e) => handleApiKeyChange(index, e.target.value)}
                        placeholder={`${dict.settings.imageServiceApiKeyPlaceholder || 'Enter API key'} ${index + 1}`}
                        className="flex-1 px-3 py-2 bg-background border-2 border-border text-foreground focus:outline-none focus:border-primary rounded-md text-sm"
                      />
                      {formData.apiKeys.length > 1 && (
                        <button
                          onClick={() => handleRemoveApiKey(index)}
                          className="px-3 py-2 bg-destructive/10 hover:bg-destructive/20 text-destructive border-2 border-destructive rounded-md transition-colors"
                          aria-label="Remove API key"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  onClick={handleCancel}
                  className="px-4 py-2 bg-muted hover:bg-accent text-foreground border-2 border-border rounded-md transition-colors"
                >
                  {dict.settings.cancel || 'Cancel'}
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaving || !formData.name.trim() || formData.apiKeys.every(key => !key.trim())}
                  className="px-4 py-2 bg-primary text-primary-foreground border-2 border-border hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-medium"
                >
                  <Save className="w-4 h-4" />
                  <span>{dict.settings.save || 'Save'}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Services List */}
        <div className="mb-4">
          <h3 className="text-lg font-bold text-foreground mb-1">
            {dict.settings.imageServiceList || 'Image Services'}
          </h3>
          <p className="text-sm text-muted-foreground">
            {services.length} {dict.settings.imageServiceCount || 'service(s) configured'}
          </p>
        </div>

        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">
            {dict.settings.imageServiceLoading || 'Loading image services...'}
          </div>
        ) : services.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p className="text-sm font-medium mb-1">{dict.settings.imageServiceNoServices || 'No image services configured'}</p>
            <p className="text-xs">{dict.settings.imageServiceNoServicesHint || 'Click "Add Service" to create your first image service'}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {services.map((service) => {
              const isEditing = editingId === service.id;
              
              return (
                <div
                  key={service.id}
                  className={cn(
                    'p-4 bg-card border-2 border-border rounded-md shadow-sm hover:shadow-md transition-all',
                    isEditing && 'ring-2 ring-primary'
                  )}
                >
                  <div className="flex items-start justify-between gap-4">
                    {/* Service Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <ImageIcon className="w-5 h-5 text-foreground flex-shrink-0" />
                        <h4 className="text-md font-bold text-foreground truncate">
                          {service.name}
                        </h4>
                        {service.isDefault && (
                          <span className="px-2 py-0.5 bg-primary text-primary-foreground text-xs font-medium border border-border rounded flex-shrink-0">
                            {dict.settings.imageServiceDefault || 'Default'}
                          </span>
                        )}
                        {!service.isDeletable && (
                          <span className="px-2 py-0.5 bg-muted text-muted-foreground text-xs font-medium border border-border rounded flex-shrink-0">
                            {dict.settings.imageServiceSystem || 'System'}
                          </span>
                        )}
                      </div>
                      
                      <div className="space-y-1 text-sm text-muted-foreground">
                        <div>
                          <span className="font-medium">{dict.settings.imageServiceType || 'Type'}:</span>{' '}
                          <span className="capitalize">{service.type}</span>
                        </div>
                        <div>
                          <span className="font-medium">{dict.settings.imageServiceApiKeyCount || 'API Keys'}:</span>{' '}
                          <span>{service.apiKeys.length}</span>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex-shrink-0 flex items-center gap-2">
                      <button
                        onClick={() => handleEdit(service)}
                        disabled={isEditing || isAdding}
                        className="p-2 hover:bg-accent text-foreground rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        aria-label={dict.settings.imageServiceEdit || 'Edit service'}
                        title={dict.settings.imageServiceEdit || 'Edit'}
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      {service.isDeletable && (
                        <button
                          onClick={() => setServiceToDelete(service)}
                          disabled={isEditing || isAdding}
                          className="p-2 hover:bg-destructive/10 text-destructive rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          aria-label={dict.settings.imageServiceDelete || 'Delete service'}
                          title={dict.settings.imageServiceDelete || 'Delete'}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={serviceToDelete !== null}
        title={dict.settings.imageServiceDeleteConfirmTitle || 'Delete Image Service'}
        description={
          dict.settings.imageServiceDeleteConfirmDescription || 
          `Are you sure you want to delete "${serviceToDelete?.name}"? This action cannot be undone.`
        }
        confirmLabel={dict.settings.delete || 'Delete'}
        cancelLabel={dict.settings.cancel || 'Cancel'}
        onConfirm={() => serviceToDelete && handleDelete(serviceToDelete)}
        onCancel={() => setServiceToDelete(null)}
        isDestructive={true}
      />
    </div>
  );
};

export default ImageServiceSettingsPanel;

