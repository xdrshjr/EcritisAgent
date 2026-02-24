/**
 * Search Service Settings Panel Component
 * Provides UI for configuring search services (e.g., Tavily)
 * Features:
 * - Search service list with add/edit/delete operations
 * - API key management (multiple keys per service)
 * - Test search functionality
 * - Default Tavily service (non-deletable)
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { Save, Plus, Trash2, Edit2, X, Search as SearchIcon, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { logger } from '@/lib/logger';
import {
  loadSearchServiceConfigs,
  saveSearchServiceConfigs,
  addSearchServiceConfig,
  updateSearchServiceConfig,
  deleteSearchServiceConfig,
  type SearchServiceConfig,
  type SearchServiceConfigList,
} from '@/lib/searchServiceConfig';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { cn } from '@/lib/utils';
import { buildFlaskApiUrl } from '@/lib/flaskConfig';
import ConfirmDialog from './ConfirmDialog';

interface SearchServiceSettingsPanelProps {
  className?: string;
}

interface SearchResult {
  title: string;
  url: string;
  content: string;
  score?: number;
}

const SearchServiceSettingsPanel = ({ className }: SearchServiceSettingsPanelProps) => {
  const { locale } = useLanguage();
  const dict = getDictionary(locale);
  
  const [services, setServices] = useState<SearchServiceConfig[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [serviceToDelete, setServiceToDelete] = useState<SearchServiceConfig | null>(null);
  
  // Form data
  const [formData, setFormData] = useState<{
    name: string;
    type: 'tavily' | 'custom';
    apiKeys: string[];
  }>({
    name: '',
    type: 'tavily',
    apiKeys: [''],
  });

  // Test search
  const [testSearchQuery, setTestSearchQuery] = useState<string>('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchError, setSearchError] = useState<string>('');

  // Load search service configurations on mount
  useEffect(() => {
    logger.component('SearchServiceSettingsPanel', 'mounted');
    handleLoadConfigs();
  }, []);

  // Load search service configurations
  const handleLoadConfigs = useCallback(async () => {
    logger.info('Loading search service configurations', undefined, 'SearchServiceSettingsPanel');
    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      const configList = await loadSearchServiceConfigs();
      setServices(configList.searchServices || []);
      
      logger.success('Search service configurations loaded', {
        count: configList.searchServices.length,
      }, 'SearchServiceSettingsPanel');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load search service configurations';
      logger.error('Failed to load search service configurations', {
        error: errorMessage,
      }, 'SearchServiceSettingsPanel');
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Handle add new service
  const handleAdd = () => {
    logger.info('Starting to add new search service', undefined, 'SearchServiceSettingsPanel');
    setIsAdding(true);
    setEditingId(null);
    setFormData({
      name: '',
      type: 'tavily',
      apiKeys: [''],
    });
    setError('');
    setSuccess('');
  };

  // Handle edit service
  const handleEdit = (service: SearchServiceConfig) => {
    logger.info('Starting to edit search service', { id: service.id, name: service.name }, 'SearchServiceSettingsPanel');
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
    logger.debug('Canceling search service edit/add', undefined, 'SearchServiceSettingsPanel');
    setEditingId(null);
    setIsAdding(false);
    setFormData({
      name: '',
      type: 'tavily',
      apiKeys: [''],
    });
    setError('');
    setSuccess('');
  };

  // Handle save service
  const handleSave = async () => {
    if (!formData.name || !formData.name.trim()) {
      setError(dict.settings.searchServiceNameRequired || 'Service name is required');
      return;
    }

    if (!formData.apiKeys || formData.apiKeys.length === 0 || formData.apiKeys.every(key => !key.trim())) {
      setError(dict.settings.searchServiceApiKeyRequired || 'At least one API key is required');
      return;
    }

    // Filter out empty API keys
    const validApiKeys = formData.apiKeys.filter(key => key.trim().length > 0);

    logger.info('Saving search service configuration', {
      isAdding,
      editingId,
      name: formData.name,
      type: formData.type,
      apiKeyCount: validApiKeys.length,
    }, 'SearchServiceSettingsPanel');

    setIsSaving(true);
    setError('');
    setSuccess('');

    try {
      if (isAdding) {
        const result = await addSearchServiceConfig({
          name: formData.name.trim(),
          type: formData.type,
          apiKeys: validApiKeys,
          isDeletable: true,
        });

        if (result.success && result.service) {
          logger.success('Search service added successfully', {
            id: result.service.id,
            name: result.service.name,
          }, 'SearchServiceSettingsPanel');
          
          setSuccess(dict.settings.searchServiceSaveSuccess || 'Search service saved successfully');
          await handleLoadConfigs();
          handleCancel();
          
          setTimeout(() => setSuccess(''), 3000);
        } else {
          throw new Error(result.error || 'Failed to add search service');
        }
      } else if (editingId) {
        const result = await updateSearchServiceConfig(editingId, {
          name: formData.name.trim(),
          type: formData.type,
          apiKeys: validApiKeys,
        });

        if (result.success) {
          logger.success('Search service updated successfully', {
            id: editingId,
          }, 'SearchServiceSettingsPanel');
          
          setSuccess(dict.settings.searchServiceSaveSuccess || 'Search service saved successfully');
          await handleLoadConfigs();
          handleCancel();
          
          setTimeout(() => setSuccess(''), 3000);
        } else {
          throw new Error(result.error || 'Failed to update search service');
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to save search service';
      logger.error('Failed to save search service', {
        error: errorMessage,
      }, 'SearchServiceSettingsPanel');
      setError(errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  // Handle delete service
  const handleDelete = async (service: SearchServiceConfig) => {
    if (!service.isDeletable) {
      setError(dict.settings.searchServiceCannotDelete || 'This service cannot be deleted');
      return;
    }

    logger.info('Deleting search service', { id: service.id, name: service.name }, 'SearchServiceSettingsPanel');
    
    try {
      const result = await deleteSearchServiceConfig(service.id);
      
      if (result.success) {
        logger.success('Search service deleted successfully', {
          id: service.id,
          name: service.name,
        }, 'SearchServiceSettingsPanel');
        
        setSuccess(dict.settings.searchServiceDeleteSuccess || 'Search service deleted successfully');
        await handleLoadConfigs();
        setServiceToDelete(null);
        
        setTimeout(() => setSuccess(''), 3000);
      } else {
        throw new Error(result.error || 'Failed to delete search service');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete search service';
      logger.error('Failed to delete search service', {
        error: errorMessage,
      }, 'SearchServiceSettingsPanel');
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
      setSearchError(dict.settings.searchServiceSearchQueryRequired || 'Please enter a search query');
      return;
    }

    logger.info('Testing search', {
      query: testSearchQuery,
    }, 'SearchServiceSettingsPanel');

    setIsSearching(true);
    setSearchError('');
    setSearchResults([]);

    try {
      const apiUrl = buildFlaskApiUrl('/api/search-services/search');
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: testSearchQuery.trim(),
          maxResults: 5,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const result = await response.json();
      
      if (result.success && result.results) {
        logger.success('Search completed', {
          query: testSearchQuery,
          resultCount: result.results.length,
        }, 'SearchServiceSettingsPanel');
        
        setSearchResults(result.results);
      } else {
        throw new Error(result.error || 'No results found');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to search';
      logger.error('Search failed', {
        error: errorMessage,
        query: testSearchQuery,
      }, 'SearchServiceSettingsPanel');
      setSearchError(errorMessage);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className={cn('h-full flex flex-col overflow-hidden bg-background', className)}>
      {/* Header */}
      <div className="flex-shrink-0 border-b border-border bg-card p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold text-foreground mb-1">
              {dict.settings.searchServiceTitle || 'Search Services'}
            </h3>
            <p className="text-sm text-muted-foreground">
              {dict.settings.searchServiceDescription || 'Configure search services for web search functionality'}
            </p>
          </div>
          {!isAdding && !editingId && (
            <button
              onClick={handleAdd}
              className="px-4 py-2 bg-primary text-primary-foreground border border-border rounded-md shadow-sm transition-all flex items-center gap-2 font-medium"
              aria-label={dict.settings.searchServiceAdd || 'Add Search Service'}
            >
              <Plus className="w-4 h-4" />
              <span>{dict.settings.searchServiceAdd || 'Add Service'}</span>
            </button>
          )}
        </div>

        {/* Messages */}
        {error && (
          <div className="mb-3 p-3 bg-destructive/10 border border-destructive text-destructive-foreground text-sm rounded-md flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
        
        {success && (
          <div className="mb-3 p-3 bg-green-600/10 border border-green-600 text-green-600 text-sm rounded-md flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {/* Test Search Section */}
        <div className="mt-4 p-4 bg-muted/50 border border-border rounded-md">
          <div className="flex items-center gap-2 mb-3">
            <SearchIcon className="w-4 h-4 text-foreground" />
            <h4 className="text-sm font-semibold text-foreground">
              {dict.settings.searchServiceTestSearch || 'Test Search'}
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
              placeholder={dict.settings.searchServiceSearchPlaceholder || 'Enter search query...'}
              className="flex-1 px-3 py-2 bg-background border border-border text-foreground focus:outline-none focus:border-primary rounded-md text-sm"
              disabled={isSearching}
            />
            <button
              onClick={handleTestSearch}
              disabled={isSearching || !testSearchQuery.trim()}
              className="px-4 py-2 bg-primary text-primary-foreground border border-border rounded-md shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-medium"
            >
              {isSearching ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{dict.settings.searchServiceSearching || 'Searching...'}</span>
                </>
              ) : (
                <>
                  <SearchIcon className="w-4 h-4" />
                  <span>{dict.settings.searchServiceSearch || 'Search'}</span>
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
            <div className="mt-4 space-y-2">
              {searchResults.map((result, index) => (
                <div
                  key={index}
                  className="p-3 bg-background border border-border rounded-md hover:shadow-md transition-all"
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <a
                      href={result.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-semibold text-primary hover:underline flex-1"
                    >
                      {result.title || result.url}
                    </a>
                    {result.score !== undefined && (
                      <span className="text-xs text-muted-foreground px-2 py-0.5 bg-muted rounded">
                        {Math.round(result.score * 100)}%
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {result.content}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Services List */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Add/Edit Form */}
        {(isAdding || editingId) && (
          <div className="mb-4 p-4 bg-card border border-border rounded-md shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-md font-bold text-foreground">
                {isAdding
                  ? dict.settings.searchServiceAdd || 'Add Search Service'
                  : dict.settings.searchServiceEdit || 'Edit Search Service'}
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
                  {dict.settings.searchServiceName || 'Service Name'}
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder={dict.settings.searchServiceNamePlaceholder || 'Enter service name...'}
                  className="w-full px-3 py-2 bg-background border border-border text-foreground focus:outline-none focus:border-primary rounded-md text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  {dict.settings.searchServiceType || 'Service Type'}
                </label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value as 'tavily' | 'custom' })}
                  className="w-full px-3 py-2 bg-background border border-border text-foreground focus:outline-none focus:border-primary rounded-md text-sm"
                  disabled={editingId !== null && services.find(s => s.id === editingId)?.type === 'tavily' && !services.find(s => s.id === editingId)?.isDeletable}
                >
                  <option value="tavily">Tavily</option>
                  <option value="custom">Custom</option>
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-medium text-foreground">
                    {dict.settings.searchServiceApiKeys || 'API Keys'} ({dict.settings.searchServiceApiKeysHint || 'Multiple keys for load balancing'})
                  </label>
                  <button
                    onClick={handleAddApiKey}
                    className="text-xs px-2 py-1 bg-muted hover:bg-accent text-foreground rounded transition-colors flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    <span>{dict.settings.searchServiceAddApiKey || 'Add Key'}</span>
                  </button>
                </div>
                <div className="space-y-2">
                  {formData.apiKeys.map((key, index) => (
                    <div key={index} className="flex gap-2">
                      <input
                        type="password"
                        value={key}
                        onChange={(e) => handleApiKeyChange(index, e.target.value)}
                        placeholder={`${dict.settings.searchServiceApiKeyPlaceholder || 'Enter API key'} ${index + 1}`}
                        className="flex-1 px-3 py-2 bg-background border border-border text-foreground focus:outline-none focus:border-primary rounded-md text-sm"
                      />
                      {formData.apiKeys.length > 1 && (
                        <button
                          onClick={() => handleRemoveApiKey(index)}
                          className="px-3 py-2 bg-destructive/10 hover:bg-destructive/20 text-destructive border border-destructive rounded-md transition-colors"
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
                  className="px-4 py-2 bg-muted hover:bg-accent text-foreground border border-border rounded-md transition-colors"
                >
                  {dict.settings.cancel || 'Cancel'}
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaving || !formData.name.trim() || formData.apiKeys.every(key => !key.trim())}
                  className="px-4 py-2 bg-primary text-primary-foreground border border-border rounded-md shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-medium"
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
            {dict.settings.searchServiceList || 'Search Services'}
          </h3>
          <p className="text-sm text-muted-foreground">
            {services.length} {dict.settings.searchServiceCount || 'service(s) configured'}
          </p>
        </div>

        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">
            {dict.settings.searchServiceLoading || 'Loading search services...'}
          </div>
        ) : services.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p className="text-sm font-medium mb-1">{dict.settings.searchServiceNoServices || 'No search services configured'}</p>
            <p className="text-xs">{dict.settings.searchServiceNoServicesHint || 'Click "Add Service" to create your first search service'}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {services.map((service) => {
              const isEditing = editingId === service.id;
              
              return (
                <div
                  key={service.id}
                  className={cn(
                    'p-4 bg-card border border-border rounded-md shadow-sm hover:shadow-md transition-all',
                    isEditing && 'ring-2 ring-primary'
                  )}
                >
                  <div className="flex items-start justify-between gap-4">
                    {/* Service Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <SearchIcon className="w-5 h-5 text-foreground flex-shrink-0" />
                        <h4 className="text-md font-bold text-foreground truncate">
                          {service.name}
                        </h4>
                        {service.isDefault && (
                          <span className="px-2 py-0.5 bg-primary text-primary-foreground text-xs font-medium border border-border rounded flex-shrink-0">
                            {dict.settings.searchServiceDefault || 'Default'}
                          </span>
                        )}
                        {!service.isDeletable && (
                          <span className="px-2 py-0.5 bg-muted text-muted-foreground text-xs font-medium border border-border rounded flex-shrink-0">
                            {dict.settings.searchServiceSystem || 'System'}
                          </span>
                        )}
                      </div>
                      
                      <div className="space-y-1 text-sm text-muted-foreground">
                        <div>
                          <span className="font-medium">{dict.settings.searchServiceType || 'Type'}:</span>{' '}
                          <span className="capitalize">{service.type}</span>
                        </div>
                        <div>
                          <span className="font-medium">{dict.settings.searchServiceApiKeyCount || 'API Keys'}:</span>{' '}
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
                        aria-label={dict.settings.searchServiceEdit || 'Edit service'}
                        title={dict.settings.searchServiceEdit || 'Edit'}
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      {service.isDeletable && (
                        <button
                          onClick={() => setServiceToDelete(service)}
                          disabled={isEditing || isAdding}
                          className="p-2 hover:bg-destructive/10 text-destructive rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          aria-label={dict.settings.searchServiceDelete || 'Delete service'}
                          title={dict.settings.searchServiceDelete || 'Delete'}
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
        title={dict.settings.searchServiceDeleteConfirmTitle || 'Delete Search Service'}
        description={
          dict.settings.searchServiceDeleteConfirmDescription || 
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

export default SearchServiceSettingsPanel;




