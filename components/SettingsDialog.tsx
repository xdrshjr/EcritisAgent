/**
 * Settings Dialog Component
 * Modal dialog for application settings with tabbed interface
 * Features: Model configuration management with add/edit/delete operations
 */

'use client';

import { useState, useEffect } from 'react';
import { X, Plus, Trash2, Save, Star, Power } from 'lucide-react';
import { logger } from '@/lib/logger';
import {
  loadModelConfigs,
  addModelConfig,
  deleteModelConfig,
  setDefaultModel,
  toggleModelEnabled,
  type ModelConfig,
  type ModelConfigList,
} from '@/lib/modelConfig';
import { syncModelConfigsToCookies } from '@/lib/modelConfigSync';

interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

type SettingTab = 'models';

const SettingsDialog = ({ isOpen, onClose }: SettingsDialogProps) => {
  const [activeTab, setActiveTab] = useState<SettingTab>('models');
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');

  // Form state
  const [formName, setFormName] = useState('');
  const [formApiUrl, setFormApiUrl] = useState('');
  const [formApiKey, setFormApiKey] = useState('');
  const [formModelName, setFormModelName] = useState('');
  const [isFormVisible, setIsFormVisible] = useState(false);

  useEffect(() => {
    logger.component('SettingsDialog', 'mounted', { isOpen });
  }, []);

  useEffect(() => {
    if (isOpen) {
      logger.info('Settings dialog opened', undefined, 'SettingsDialog');
      handleLoadModels();
    }
  }, [isOpen]);

  const handleLoadModels = async () => {
    logger.info('Loading model configurations', undefined, 'SettingsDialog');
    setIsLoading(true);
    setError('');

    try {
      const configList: ModelConfigList = await loadModelConfigs();
      setModels(configList.models);
      
      logger.success('Model configurations loaded', {
        count: configList.models.length,
      }, 'SettingsDialog');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load models';
      logger.error('Failed to load model configurations', { error: errorMessage }, 'SettingsDialog');
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddModel = async () => {
    logger.info('Adding new model', { name: formName }, 'SettingsDialog');
    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      const result = await addModelConfig({
        name: formName.trim(),
        apiUrl: formApiUrl.trim(),
        apiKey: formApiKey.trim(),
        modelName: formModelName.trim(),
      });

      if (result.success && result.model) {
        logger.success('Model added successfully', {
          id: result.model.id,
          name: result.model.name,
        }, 'SettingsDialog');

        setSuccess('Model added successfully!');
        setFormName('');
        setFormApiUrl('');
        setFormApiKey('');
        setFormModelName('');
        setIsFormVisible(false);
        
        // Reload models and sync to cookies
        await handleLoadModels();
        await syncModelConfigsToCookies();
      } else {
        throw new Error(result.error || 'Failed to add model');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to add model';
      logger.error('Failed to add model', { error: errorMessage }, 'SettingsDialog');
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteModel = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete the model "${name}"?`)) {
      return;
    }

    logger.info('Deleting model', { id, name }, 'SettingsDialog');
    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      const result = await deleteModelConfig(id);

      if (result.success) {
        logger.success('Model deleted successfully', { id, name }, 'SettingsDialog');
        setSuccess('Model deleted successfully!');
        
        // Reload models and sync to cookies
        await handleLoadModels();
        await syncModelConfigsToCookies();
      } else {
        throw new Error(result.error || 'Failed to delete model');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete model';
      logger.error('Failed to delete model', { error: errorMessage, id }, 'SettingsDialog');
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSetDefault = async (id: string, name: string) => {
    logger.info('Setting default model', { id, name }, 'SettingsDialog');
    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      const result = await setDefaultModel(id);

      if (result.success) {
        logger.success('Default model set successfully', { id, name }, 'SettingsDialog');
        setSuccess(`"${name}" set as default model!`);
        
        // Reload models and sync to cookies
        await handleLoadModels();
        await syncModelConfigsToCookies();
      } else {
        throw new Error(result.error || 'Failed to set default model');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to set default model';
      logger.error('Failed to set default model', { error: errorMessage, id }, 'SettingsDialog');
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleEnabled = async (id: string, name: string, currentStatus: boolean) => {
    logger.info('Toggling model enabled status', { id, name, currentStatus }, 'SettingsDialog');
    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      const result = await toggleModelEnabled(id);

      if (result.success) {
        const newStatus = result.isEnabled ? 'enabled' : 'disabled';
        logger.success('Model enabled status toggled', { id, name, newStatus }, 'SettingsDialog');
        setSuccess(`"${name}" ${newStatus} successfully!`);
        
        // Reload models and sync to cookies
        await handleLoadModels();
        await syncModelConfigsToCookies();
      } else {
        throw new Error(result.error || 'Failed to toggle model status');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to toggle model status';
      logger.error('Failed to toggle model status', { error: errorMessage, id }, 'SettingsDialog');
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    logger.info('Settings dialog closed', undefined, 'SettingsDialog');
    setIsFormVisible(false);
    setFormName('');
    setFormApiUrl('');
    setFormApiKey('');
    setFormModelName('');
    setError('');
    setSuccess('');
    onClose();
  };

  const handleShowAddForm = () => {
    logger.debug('Showing add model form', undefined, 'SettingsDialog');
    setIsFormVisible(true);
    setError('');
    setSuccess('');
  };

  const handleCancelAdd = () => {
    logger.debug('Canceling add model form', undefined, 'SettingsDialog');
    setIsFormVisible(false);
    setFormName('');
    setFormApiUrl('');
    setFormApiKey('');
    setFormModelName('');
    setError('');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-background border-4 border-border shadow-lg w-[90%] h-[80%] flex flex-col">
        {/* Header */}
        <div className="h-12 bg-primary border-b-4 border-border flex items-center justify-between px-4">
          <h2 className="text-lg font-bold text-primary-foreground">Settings</h2>
          <button
            onClick={handleClose}
            className="w-8 h-8 flex items-center justify-center hover:bg-primary-foreground hover:bg-opacity-20 transition-colors"
            aria-label="Close Settings"
          >
            <X className="w-5 h-5 text-primary-foreground" />
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Sidebar - 10% */}
          <div className="w-[10%] bg-muted border-r-4 border-border flex flex-col">
            <button
              onClick={() => setActiveTab('models')}
              className={`px-3 py-3 text-left text-sm font-medium border-b-2 border-border transition-colors ${
                activeTab === 'models'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-foreground hover:bg-secondary'
              }`}
            >
              Models Configuration
            </button>
          </div>

          {/* Right Content - 80% */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Messages */}
            {error && (
              <div className="mx-4 mt-4 p-3 bg-destructive border-2 border-border text-destructive-foreground text-sm">
                {error}
              </div>
            )}
            
            {success && (
              <div className="mx-4 mt-4 p-3 bg-secondary border-2 border-border text-secondary-foreground text-sm">
                {success}
              </div>
            )}

            {/* Models Tab Content */}
            {activeTab === 'models' && (
              <div className="flex-1 flex flex-col overflow-hidden p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-foreground">LLM Models</h3>
                  {!isFormVisible && (
                    <button
                      onClick={handleShowAddForm}
                      disabled={isLoading}
                      className="px-4 py-2 bg-primary text-primary-foreground border-2 border-border hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                      aria-label="Add Model"
                    >
                      <Plus className="w-4 h-4" />
                      <span className="font-medium">Add Model</span>
                    </button>
                  )}
                </div>

                {/* Add Model Form */}
                {isFormVisible && (
                  <div className="mb-4 p-4 bg-card border-4 border-border shadow-sm">
                    <h4 className="text-md font-bold text-foreground mb-3">Add New Model</h4>
                    
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-foreground mb-1">
                          Model Display Name *
                        </label>
                        <input
                          type="text"
                          value={formName}
                          onChange={(e) => setFormName(e.target.value)}
                          placeholder="e.g., GPT-4 Turbo"
                          className="w-full px-3 py-2 bg-background border-2 border-border text-foreground focus:outline-none focus:border-primary"
                          disabled={isLoading}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-foreground mb-1">
                          API URL *
                        </label>
                        <input
                          type="url"
                          value={formApiUrl}
                          onChange={(e) => setFormApiUrl(e.target.value)}
                          placeholder="https://api.openai.com/v1"
                          className="w-full px-3 py-2 bg-background border-2 border-border text-foreground focus:outline-none focus:border-primary"
                          disabled={isLoading}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-foreground mb-1">
                          Model Name *
                        </label>
                        <input
                          type="text"
                          value={formModelName}
                          onChange={(e) => setFormModelName(e.target.value)}
                          placeholder="e.g., gpt-4-turbo"
                          className="w-full px-3 py-2 bg-background border-2 border-border text-foreground focus:outline-none focus:border-primary"
                          disabled={isLoading}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-foreground mb-1">
                          API Key *
                        </label>
                        <input
                          type="password"
                          value={formApiKey}
                          onChange={(e) => setFormApiKey(e.target.value)}
                          placeholder="sk-..."
                          className="w-full px-3 py-2 bg-background border-2 border-border text-foreground focus:outline-none focus:border-primary"
                          disabled={isLoading}
                        />
                      </div>

                      <div className="flex gap-2 pt-2">
                        <button
                          onClick={handleAddModel}
                          disabled={
                            isLoading ||
                            !formName.trim() ||
                            !formApiUrl.trim() ||
                            !formApiKey.trim() ||
                            !formModelName.trim()
                          }
                          className="px-4 py-2 bg-primary text-primary-foreground border-2 border-border hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                          <Save className="w-4 h-4" />
                          <span className="font-medium">Save Model</span>
                        </button>
                        <button
                          onClick={handleCancelAdd}
                          disabled={isLoading}
                          className="px-4 py-2 bg-muted text-foreground border-2 border-border hover:bg-secondary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Model List */}
                <div className="flex-1 overflow-y-auto">
                  {isLoading && models.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      Loading models...
                    </div>
                  ) : models.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No models configured. Add your first model to get started.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {models.map((model) => (
                        <div
                          key={model.id}
                          className={`p-4 bg-card border-4 border-border shadow-sm hover:shadow-md transition-all ${
                            model.isEnabled === false ? 'opacity-60' : ''
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <h4 className="text-md font-bold text-foreground">
                                  {model.name}
                                </h4>
                                {model.isDefault && (
                                  <span className="px-2 py-0.5 bg-accent text-accent-foreground text-xs font-medium border border-border flex items-center gap-1">
                                    <Star className="w-3 h-3" />
                                    Default
                                  </span>
                                )}
                                {model.isEnabled === false && (
                                  <span className="px-2 py-0.5 bg-muted text-muted-foreground text-xs font-medium border border-border">
                                    Disabled
                                  </span>
                                )}
                              </div>
                              
                              <div className="space-y-1 text-sm text-muted-foreground">
                                <div>
                                  <span className="font-medium">Model:</span> {model.modelName}
                                </div>
                                <div>
                                  <span className="font-medium">API URL:</span> {model.apiUrl}
                                </div>
                                <div>
                                  <span className="font-medium">API Key:</span> ••••••••
                                </div>
                              </div>
                            </div>

                            <div className="flex gap-2 ml-4">
                              <button
                                onClick={() => handleToggleEnabled(model.id, model.name, model.isEnabled !== false)}
                                disabled={isLoading}
                                className={`p-2 border-2 border-border hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                                  model.isEnabled !== false
                                    ? 'bg-green-600 text-white'
                                    : 'bg-muted text-muted-foreground'
                                }`}
                                aria-label={model.isEnabled !== false ? 'Disable Model' : 'Enable Model'}
                                title={model.isEnabled !== false ? 'Disable Model' : 'Enable Model'}
                              >
                                <Power className="w-4 h-4" />
                              </button>
                              {!model.isDefault && model.isEnabled !== false && (
                                <button
                                  onClick={() => handleSetDefault(model.id, model.name)}
                                  disabled={isLoading}
                                  className="p-2 bg-secondary text-secondary-foreground border-2 border-border hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                  aria-label="Set as Default"
                                  title="Set as Default"
                                >
                                  <Star className="w-4 h-4" />
                                </button>
                              )}
                              <button
                                onClick={() => handleDeleteModel(model.id, model.name)}
                                disabled={isLoading}
                                className="p-2 bg-destructive text-destructive-foreground border-2 border-border hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                aria-label="Delete Model"
                                title="Delete Model"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsDialog;

