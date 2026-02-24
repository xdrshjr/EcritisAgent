/**
 * Model Settings Panel Component
 * Manages LLM model configurations with maxToken support
 */

'use client';

import { useState, useEffect } from 'react';
import { Plus, Trash2, Save, Star, Edit, XCircle, Power, Check } from 'lucide-react';
import { logger } from '@/lib/logger';
import {
  loadModelConfigs,
  addModelConfig,
  updateModelConfig,
  deleteModelConfig,
  setDefaultModel,
  toggleModelEnabled,
  clearAllModels,
  saveModelConfigs,
  type ModelConfig,
  type ModelConfigList,
} from '@/lib/modelConfig';
import { syncModelConfigsToCookies } from '@/lib/modelConfigSync';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { getDictionary } from '@/lib/i18n/dictionaries';

interface ModelSettingsPanelProps {
  className?: string;
}

const ModelSettingsPanel = ({ className }: ModelSettingsPanelProps) => {
  const { locale } = useLanguage();
  const dict = getDictionary(locale);
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [stagedModels, setStagedModels] = useState<ModelConfig[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');

  // Form state
  const [formName, setFormName] = useState('');
  const [formApiUrl, setFormApiUrl] = useState('');
  const [formApiKey, setFormApiKey] = useState('');
  const [formModelName, setFormModelName] = useState('');
  const [formMaxToken, setFormMaxToken] = useState<string>('');
  const [isFormVisible, setIsFormVisible] = useState(false);
  
  // Edit mode state
  const [editingModelId, setEditingModelId] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);

  useEffect(() => {
    logger.component('ModelSettingsPanel', 'mounted');
    handleLoadModels();
  }, []);

  const handleLoadModels = async () => {
    logger.info('Loading model configurations', undefined, 'ModelSettingsPanel');
    setIsLoading(true);
    setError('');

    try {
      const configList: ModelConfigList = await loadModelConfigs();
      setModels(configList.models);
      setStagedModels(JSON.parse(JSON.stringify(configList.models))); // Deep copy
      setHasChanges(false);
      
      logger.success('Model configurations loaded', {
        count: configList.models.length,
      }, 'ModelSettingsPanel');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load models';
      logger.error('Failed to load model configurations', { error: errorMessage }, 'ModelSettingsPanel');
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddModel = async () => {
    logger.info('Adding new model', { name: formName }, 'ModelSettingsPanel');
    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      const result = await addModelConfig({
        name: formName.trim(),
        apiUrl: formApiUrl.trim(),
        apiKey: formApiKey.trim(),
        modelName: formModelName.trim(),
        maxToken: formMaxToken.trim() ? parseInt(formMaxToken.trim(), 10) : undefined,
      });

      if (result.success && result.model) {
        logger.success('Model added successfully', {
          id: result.model.id,
          name: result.model.name,
        }, 'ModelSettingsPanel');

        // Update state immediately with the newly added model
        const updatedModels = [...models, result.model];
        setModels(updatedModels);
        setStagedModels(JSON.parse(JSON.stringify(updatedModels))); // Deep copy
        
        logger.debug('Model list updated in UI', {
          modelId: result.model.id,
          totalModels: updatedModels.length,
        }, 'ModelSettingsPanel');

        setSuccess('Model added successfully!');
        handleResetForm();
      } else {
        throw new Error(result.error || 'Failed to add model');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to add model';
      logger.error('Failed to add model', { error: errorMessage }, 'ModelSettingsPanel');
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateModel = async () => {
    if (!editingModelId) {
      logger.warn('No model ID for update', undefined, 'ModelSettingsPanel');
      return;
    }

    logger.info('Updating model', { id: editingModelId, name: formName }, 'ModelSettingsPanel');
    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      const result = await updateModelConfig(editingModelId, {
        name: formName.trim(),
        apiUrl: formApiUrl.trim(),
        apiKey: formApiKey.trim(),
        modelName: formModelName.trim(),
        maxToken: formMaxToken.trim() ? parseInt(formMaxToken.trim(), 10) : undefined,
      });

      if (result.success) {
        logger.success('Model updated successfully', {
          id: editingModelId,
          name: formName,
        }, 'ModelSettingsPanel');

        // Update state immediately with the modified model
        const updatedModels = models.map(model => 
          model.id === editingModelId
            ? {
                ...model,
                name: formName.trim(),
                apiUrl: formApiUrl.trim(),
                apiKey: formApiKey.trim(),
                modelName: formModelName.trim(),
                maxToken: formMaxToken.trim() ? parseInt(formMaxToken.trim(), 10) : undefined,
                updatedAt: new Date().toISOString(),
              }
            : model
        );
        setModels(updatedModels);
        setStagedModels(JSON.parse(JSON.stringify(updatedModels))); // Deep copy
        
        logger.debug('Model list updated in UI after edit', {
          modelId: editingModelId,
          totalModels: updatedModels.length,
        }, 'ModelSettingsPanel');

        setSuccess('Model updated successfully!');
        handleResetForm();
      } else {
        throw new Error(result.error || 'Failed to update model');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update model';
      logger.error('Failed to update model', { error: errorMessage, id: editingModelId }, 'ModelSettingsPanel');
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditModel = (model: ModelConfig) => {
    logger.info('Entering edit mode', { id: model.id, name: model.name }, 'ModelSettingsPanel');
    
    setEditingModelId(model.id);
    setIsEditMode(true);
    setFormName(model.name);
    setFormApiUrl(model.apiUrl);
    setFormApiKey(model.apiKey);
    setFormModelName(model.modelName);
    setFormMaxToken(model.maxToken?.toString() || '');
    setIsFormVisible(true);
    setError('');
    setSuccess('');
  };

  const handleSubmitForm = () => {
    if (isEditMode) {
      handleUpdateModel();
    } else {
      handleAddModel();
    }
  };

  const handleResetForm = () => {
    logger.debug('Resetting form', undefined, 'ModelSettingsPanel');
    
    setFormName('');
    setFormApiUrl('');
    setFormApiKey('');
    setFormModelName('');
    setFormMaxToken('');
    setIsFormVisible(false);
    setEditingModelId(null);
    setIsEditMode(false);
  };

  const handleClearAllModels = async () => {
    const modelCount = stagedModels.length;
    
    if (modelCount === 0) {
      logger.info('No models to clear', undefined, 'ModelSettingsPanel');
      setError('No models to clear');
      return;
    }

    if (!confirm(`Are you sure you want to clear all ${modelCount} model(s)? This action cannot be undone.`)) {
      logger.debug('Clear all models cancelled by user', undefined, 'ModelSettingsPanel');
      return;
    }

    logger.info('Clearing all models', { count: modelCount }, 'ModelSettingsPanel');
    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      const result = await clearAllModels();

      if (result.success) {
        logger.success('All models cleared successfully', { count: modelCount }, 'ModelSettingsPanel');
        setSuccess('All models cleared successfully!');
        
        // Reset form if it was open
        handleResetForm();
        
        // Reload models to get empty state
        await handleLoadModels();
      } else {
        throw new Error(result.error || 'Failed to clear all models');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to clear all models';
      logger.error('Failed to clear all models', { error: errorMessage }, 'ModelSettingsPanel');
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteModel = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete the model "${name}"?`)) {
      logger.debug('Delete model cancelled by user', { id, name }, 'ModelSettingsPanel');
      return;
    }

    logger.info('Deleting model', { id, name }, 'ModelSettingsPanel');
    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      const result = await deleteModelConfig(id);

      if (result.success) {
        logger.success('Model deleted successfully', { id, name }, 'ModelSettingsPanel');
        
        // Update state immediately by filtering out the deleted model
        const updatedModels = models.filter(model => model.id !== id);
        setModels(updatedModels);
        setStagedModels(JSON.parse(JSON.stringify(updatedModels))); // Deep copy
        
        logger.debug('Model list updated in UI after deletion', {
          deletedModelId: id,
          remainingModels: updatedModels.length,
        }, 'ModelSettingsPanel');
        
        setSuccess('Model deleted successfully!');
      } else {
        throw new Error(result.error || 'Failed to delete model');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete model';
      logger.error('Failed to delete model', { error: errorMessage, id }, 'ModelSettingsPanel');
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSetDefault = async (id: string, name: string) => {
    logger.info('Setting default model', { id, name }, 'ModelSettingsPanel');
    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      const result = await setDefaultModel(id);

      if (result.success) {
        logger.success('Default model set successfully', { id, name }, 'ModelSettingsPanel');
        
        // Update state immediately - set selected model as default and clear others
        const updatedModels = models.map(model => ({
          ...model,
          isDefault: model.id === id,
        }));
        setModels(updatedModels);
        setStagedModels(JSON.parse(JSON.stringify(updatedModels))); // Deep copy
        
        logger.debug('Model list updated in UI after setting default', {
          defaultModelId: id,
          totalModels: updatedModels.length,
        }, 'ModelSettingsPanel');
        
        setSuccess(`"${name}" set as default model!`);
        
        // Sync to cookies for persistence
        await syncModelConfigsToCookies();
      } else {
        throw new Error(result.error || 'Failed to set default model');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to set default model';
      logger.error('Failed to set default model', { error: errorMessage, id }, 'ModelSettingsPanel');
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStagedToggleEnabled = (id: string) => {
    logger.info('Toggling model enabled status (staged)', { id }, 'ModelSettingsPanel');
    
    const updatedModels = stagedModels.map(model => {
      if (model.id === id) {
        const newEnabled = !model.isEnabled;
        
        // If disabling the default model, set first enabled model as default
        if (!newEnabled && model.isDefault) {
          const firstEnabledIndex = stagedModels.findIndex(m => m.id !== id && m.isEnabled !== false);
          if (firstEnabledIndex >= 0) {
            stagedModels[firstEnabledIndex].isDefault = true;
            logger.debug('Transferring default to another enabled model', {
              newDefaultId: stagedModels[firstEnabledIndex].id,
            }, 'ModelSettingsPanel');
          }
          return { ...model, isEnabled: newEnabled, isDefault: false };
        }
        
        return { ...model, isEnabled: newEnabled };
      }
      return model;
    });
    
    setStagedModels(updatedModels);
    setHasChanges(true);
    logger.debug('Model enabled status toggled in staged changes', { id }, 'ModelSettingsPanel');
  };

  const handleShowAddForm = () => {
    logger.debug('Showing add model form', undefined, 'ModelSettingsPanel');
    setIsEditMode(false);
    setEditingModelId(null);
    setIsFormVisible(true);
    setError('');
    setSuccess('');
  };

  const handleCancelForm = () => {
    logger.debug('Canceling form', { isEditMode }, 'ModelSettingsPanel');
    handleResetForm();
    setError('');
  };

  const handleConfirmChanges = async () => {
    logger.info('Confirming model configuration changes', {
      stagedCount: stagedModels.length,
      hasChanges,
    }, 'ModelSettingsPanel');

    // Validate: default model must be enabled
    const defaultModel = stagedModels.find(m => m.isDefault);
    if (defaultModel && !defaultModel.isEnabled) {
      const errorMsg = 'Default model must be enabled';
      logger.warn(errorMsg, { defaultModelId: defaultModel.id }, 'ModelSettingsPanel');
      setError(errorMsg);
      return;
    }

    // Validate: at least one model must be enabled
    const hasEnabledModel = stagedModels.some(m => m.isEnabled !== false);
    if (!hasEnabledModel) {
      const errorMsg = 'At least one model must be enabled';
      logger.warn(errorMsg, undefined, 'ModelSettingsPanel');
      setError(errorMsg);
      return;
    }

    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      // Save the staged models
      const configList: ModelConfigList = {
        models: stagedModels,
        defaultModelId: stagedModels.find(m => m.isDefault)?.id,
      };

      const result = await saveModelConfigs(configList);

      if (result.success) {
        logger.success('Model configurations saved successfully', {
          count: stagedModels.length,
        }, 'ModelSettingsPanel');

        setSuccess('Model configurations saved successfully!');
        setModels(JSON.parse(JSON.stringify(stagedModels))); // Update main state
        setHasChanges(false);

        // Sync to cookies
        await syncModelConfigsToCookies();
      } else {
        throw new Error(result.error || 'Failed to save configurations');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to save configurations';
      logger.error('Failed to save model configurations', { error: errorMessage }, 'ModelSettingsPanel');
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelChanges = () => {
    logger.info('Canceling model configuration changes', undefined, 'ModelSettingsPanel');
    
    // Revert to original models
    setStagedModels(JSON.parse(JSON.stringify(models)));
    setHasChanges(false);
    setError('');
    setSuccess('');
    
    logger.debug('Changes reverted to saved state', undefined, 'ModelSettingsPanel');
  };

  return (
    <div className={`h-full flex flex-col overflow-hidden p-4 relative ${className || ''}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-foreground">LLM Models</h3>
        {!isFormVisible && (
          <div className="flex gap-2">
            <button
              onClick={handleClearAllModels}
              disabled={isLoading || models.length === 0}
              className="px-4 py-2 bg-destructive text-destructive-foreground border border-border rounded-md shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              aria-label="Clear All Models"
              title="Clear All Models"
            >
              <XCircle className="w-4 h-4" />
              <span className="font-medium">Clear All</span>
            </button>
            <button
              onClick={handleShowAddForm}
              disabled={isLoading}
              className="px-4 py-2 bg-primary text-primary-foreground border border-border rounded-md shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              aria-label="Add Model"
            >
              <Plus className="w-4 h-4" />
              <span className="font-medium">Add Model</span>
            </button>
          </div>
        )}
      </div>

      {/* Messages */}
      {error && (
        <div className="mb-4 p-3 bg-destructive border border-border rounded-md text-destructive-foreground text-sm">
          {error}
        </div>
      )}
      
      {success && (
        <div className="mb-4 p-3 bg-secondary border border-border rounded-md text-secondary-foreground text-sm">
          {success}
        </div>
      )}

      {/* Add/Edit Model Form */}
      {isFormVisible && (
        <div className="mb-4 p-4 bg-card border border-border rounded-md shadow-sm">
          <h4 className="text-md font-bold text-foreground mb-3">
            {isEditMode ? 'Edit Model' : 'Add New Model'}
          </h4>
          
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
                className="w-full px-3 py-2 bg-background border border-border rounded-md text-foreground focus:outline-none focus:border-primary"
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
                className="w-full px-3 py-2 bg-background border border-border rounded-md text-foreground focus:outline-none focus:border-primary"
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
                className="w-full px-3 py-2 bg-background border border-border rounded-md text-foreground focus:outline-none focus:border-primary"
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
                className="w-full px-3 py-2 bg-background border border-border rounded-md text-foreground focus:outline-none focus:border-primary"
                disabled={isLoading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Max Token ({dict.settings.optional})
              </label>
              <input
                type="number"
                value={formMaxToken}
                onChange={(e) => setFormMaxToken(e.target.value)}
                placeholder="Leave empty for default maximum"
                min="1"
                className="w-full px-3 py-2 bg-background border border-border rounded-md text-foreground focus:outline-none focus:border-primary"
                disabled={isLoading}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Maximum number of tokens for responses. Leave empty to use the model's default maximum.
              </p>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={handleSubmitForm}
                disabled={
                  isLoading ||
                  !formName.trim() ||
                  !formApiUrl.trim() ||
                  !formApiKey.trim() ||
                  !formModelName.trim()
                }
                className="px-4 py-2 bg-primary text-primary-foreground border border-border rounded-md shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                <span className="font-medium">
                  {isEditMode ? 'Update Model' : 'Save Model'}
                </span>
              </button>
              <button
                onClick={handleCancelForm}
                disabled={isLoading}
                className="px-4 py-2 bg-muted text-foreground border border-border rounded-md hover:bg-secondary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Model List */}
      <div className="flex-1 overflow-y-auto mb-16">
        {isLoading && stagedModels.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Loading models...
          </div>
        ) : stagedModels.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No models configured. Add your first model to get started.
          </div>
        ) : (
          <div className="space-y-3">
            {stagedModels.map((model) => (
              <div
                key={model.id}
                className={`p-4 bg-card border border-border rounded-md shadow-sm hover:shadow-md transition-all ${
                  model.isEnabled === false ? 'opacity-60' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  {/* Model Info */}
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="text-md font-bold text-foreground">
                        {model.name}
                      </h4>
                      {model.isDefault && (
                        <button
                          onClick={() => handleSetDefault(model.id, model.name)}
                          className="px-2 py-0.5 bg-accent text-accent-foreground text-xs font-medium border border-border flex items-center gap-1 hover:bg-accent/80 transition-colors"
                          title="Default Model"
                        >
                          <Star className="w-3 h-3" />
                          Default
                        </button>
                      )}
                      {!model.isDefault && (
                        <button
                          onClick={() => handleSetDefault(model.id, model.name)}
                          className="px-2 py-0.5 bg-muted text-muted-foreground text-xs font-medium border border-border hover:bg-accent hover:text-accent-foreground transition-colors"
                          title="Set as Default"
                        >
                          Set Default
                        </button>
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
                      {model.maxToken && (
                        <div>
                          <span className="font-medium">Max Token:</span> {model.maxToken.toLocaleString()}
                        </div>
                      )}
                      {!model.maxToken && (
                        <div>
                          <span className="font-medium">Max Token:</span> <span className="text-muted-foreground italic">Default maximum</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Action Buttons - Right Side */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleEditModel(model)}
                      disabled={isLoading || isFormVisible}
                      className="p-2 bg-blue-600 text-white border border-border rounded-md shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      aria-label="Edit Model"
                      title="Edit Model"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteModel(model.id, model.name)}
                      disabled={isLoading || isFormVisible}
                      className="p-2 bg-destructive text-destructive-foreground border border-border rounded-md shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      aria-label="Delete Model"
                      title="Delete Model"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    
                    {/* Enable/Disable Toggle Switch */}
                    <button
                      onClick={() => handleStagedToggleEnabled(model.id)}
                      disabled={isLoading || isFormVisible}
                      className={`relative inline-flex h-8 w-14 items-center rounded-full border border-border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                        model.isEnabled !== false
                          ? 'bg-green-600'
                          : 'bg-muted'
                      }`}
                      aria-label={model.isEnabled !== false ? 'Disable Model' : 'Enable Model'}
                      title={model.isEnabled !== false ? 'Enabled' : 'Disabled'}
                    >
                      <span
                        className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                          model.isEnabled !== false ? 'translate-x-7' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bottom Action Bar - Confirm/Cancel Buttons */}
      {!isFormVisible && stagedModels.length > 0 && (
        <div className="absolute bottom-0 left-0 right-0 bg-background border-t border-border p-4 flex items-center justify-end gap-3">
          <button
            onClick={handleCancelChanges}
            disabled={!hasChanges || isLoading}
            className="px-6 py-2 bg-muted text-foreground border border-border rounded-md hover:bg-secondary transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirmChanges}
            disabled={!hasChanges || isLoading}
            className="px-6 py-2 bg-primary text-primary-foreground border border-border rounded-md shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-medium"
          >
            <Check className="w-4 h-4" />
            Confirm Changes
          </button>
        </div>
      )}
    </div>
  );
};

export default ModelSettingsPanel;






