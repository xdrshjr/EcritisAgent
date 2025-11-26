/**
 * Settings Dialog Component
 * Modal dialog for application settings with tabbed interface
 * Features: Model configuration management with add/edit/delete operations
 */

'use client';

import { useState, useEffect } from 'react';
import { X, Plus, Trash2, Save, Star, Power, Edit, XCircle, GripVertical, Check } from 'lucide-react';
import { logger } from '@/lib/logger';
import {
  loadModelConfigs,
  addModelConfig,
  updateModelConfig,
  deleteModelConfig,
  setDefaultModel,
  toggleModelEnabled,
  clearAllModels,
  reorderModelConfigs,
  saveModelConfigs,
  type ModelConfig,
  type ModelConfigList,
} from '@/lib/modelConfig';
import { syncModelConfigsToCookies } from '@/lib/modelConfigSync';
import {
  loadMCPConfigs,
  addMCPConfig,
  updateMCPConfig,
  deleteMCPConfig,
  toggleMCPEnabled,
  saveMCPConfigs,
  type MCPConfig,
  type MCPConfigList,
} from '@/lib/mcpConfig';

interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

type SettingTab = 'models' | 'mcp';

const SettingsDialog = ({ isOpen, onClose }: SettingsDialogProps) => {
  const [activeTab, setActiveTab] = useState<SettingTab>('models');
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
  const [isFormVisible, setIsFormVisible] = useState(false);
  
  // Edit mode state
  const [editingModelId, setEditingModelId] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);

  // Drag and drop state
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  // MCP state
  const [mcpServers, setMCPServers] = useState<MCPConfig[]>([]);
  const [mcpFormName, setMCPFormName] = useState('');
  const [mcpFormCommand, setMCPFormCommand] = useState('');
  const [mcpFormArgs, setMCPFormArgs] = useState('');
  const [mcpFormEnv, setMCPFormEnv] = useState(''); // JSON string of environment variables
  const [isMCPFormVisible, setIsMCPFormVisible] = useState(false);
  const [editingMCPId, setEditingMCPId] = useState<string | null>(null);
  const [isMCPEditMode, setIsMCPEditMode] = useState(false);
  const [mcpStartingIds, setMCPStartingIds] = useState<Set<string>>(new Set());
  const [mcpJsonPreview, setMCPJsonPreview] = useState<string>(''); // JSON preview for viewing

  useEffect(() => {
    logger.component('SettingsDialog', 'mounted', { isOpen });
  }, []);

  useEffect(() => {
    if (isOpen) {
      logger.info('Settings dialog opened', undefined, 'SettingsDialog');
      handleLoadModels();
      handleLoadMCPServers();
    }
  }, [isOpen]);

  const handleLoadModels = async () => {
    logger.info('Loading model configurations', undefined, 'SettingsDialog');
    setIsLoading(true);
    setError('');

    try {
      const configList: ModelConfigList = await loadModelConfigs();
      setModels(configList.models);
      setStagedModels(JSON.parse(JSON.stringify(configList.models))); // Deep copy
      setHasChanges(false);
      
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
        handleResetForm();
        
        // Reload models to get the newly added model
        await handleLoadModels();
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

  const handleUpdateModel = async () => {
    if (!editingModelId) {
      logger.warn('No model ID for update', undefined, 'SettingsDialog');
      return;
    }

    logger.info('Updating model', { id: editingModelId, name: formName }, 'SettingsDialog');
    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      const result = await updateModelConfig(editingModelId, {
        name: formName.trim(),
        apiUrl: formApiUrl.trim(),
        apiKey: formApiKey.trim(),
        modelName: formModelName.trim(),
      });

      if (result.success) {
        logger.success('Model updated successfully', {
          id: editingModelId,
          name: formName,
        }, 'SettingsDialog');

        setSuccess('Model updated successfully!');
        handleResetForm();
        
        // Reload models to reflect the update
        await handleLoadModels();
      } else {
        throw new Error(result.error || 'Failed to update model');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update model';
      logger.error('Failed to update model', { error: errorMessage, id: editingModelId }, 'SettingsDialog');
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditModel = (model: ModelConfig) => {
    logger.info('Entering edit mode', { id: model.id, name: model.name }, 'SettingsDialog');
    
    setEditingModelId(model.id);
    setIsEditMode(true);
    setFormName(model.name);
    setFormApiUrl(model.apiUrl);
    setFormApiKey(model.apiKey);
    setFormModelName(model.modelName);
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
    logger.debug('Resetting form', undefined, 'SettingsDialog');
    
    setFormName('');
    setFormApiUrl('');
    setFormApiKey('');
    setFormModelName('');
    setIsFormVisible(false);
    setEditingModelId(null);
    setIsEditMode(false);
  };

  const handleClearAllModels = async () => {
    const modelCount = stagedModels.length;
    
    if (modelCount === 0) {
      logger.info('No models to clear', undefined, 'SettingsDialog');
      setError('No models to clear');
      return;
    }

    if (!confirm(`Are you sure you want to clear all ${modelCount} model(s)? This action cannot be undone.`)) {
      logger.debug('Clear all models cancelled by user', undefined, 'SettingsDialog');
      return;
    }

    logger.info('Clearing all models', { count: modelCount }, 'SettingsDialog');
    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      const result = await clearAllModels();

      if (result.success) {
        logger.success('All models cleared successfully', { count: modelCount }, 'SettingsDialog');
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
      logger.error('Failed to clear all models', { error: errorMessage }, 'SettingsDialog');
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteModel = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete the model "${name}"?`)) {
      logger.debug('Delete model cancelled by user', { id, name }, 'SettingsDialog');
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
        
        // Reload models to reflect deletion
        await handleLoadModels();
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

  const handleStagedToggleEnabled = (id: string) => {
    logger.info('Toggling model enabled status (staged)', { id }, 'SettingsDialog');
    
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
            }, 'SettingsDialog');
          }
          return { ...model, isEnabled: newEnabled, isDefault: false };
        }
        
        return { ...model, isEnabled: newEnabled };
      }
      return model;
    });
    
    setStagedModels(updatedModels);
    setHasChanges(true);
    logger.debug('Model enabled status toggled in staged changes', { id }, 'SettingsDialog');
  };

  const handleClose = () => {
    logger.info('Settings dialog closed', undefined, 'SettingsDialog');
    handleResetForm();
    setError('');
    setSuccess('');
    onClose();
  };

  const handleShowAddForm = () => {
    logger.debug('Showing add model form', undefined, 'SettingsDialog');
    setIsEditMode(false);
    setEditingModelId(null);
    setIsFormVisible(true);
    setError('');
    setSuccess('');
  };

  const handleCancelForm = () => {
    logger.debug('Canceling form', { isEditMode }, 'SettingsDialog');
    handleResetForm();
    setError('');
  };

  const handleDragStart = (index: number) => {
    logger.debug('Drag started', { index }, 'SettingsDialog');
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    
    if (draggedIndex === null || draggedIndex === index) {
      return;
    }

    logger.debug('Drag over', { draggedIndex, targetIndex: index }, 'SettingsDialog');

    const newModels = [...stagedModels];
    const draggedModel = newModels[draggedIndex];
    
    // Remove from old position
    newModels.splice(draggedIndex, 1);
    // Insert at new position
    newModels.splice(index, 0, draggedModel);

    // Update default to first model
    newModels.forEach((model, idx) => {
      model.isDefault = idx === 0;
    });

    setStagedModels(newModels);
    setDraggedIndex(index);
    setHasChanges(true);
  };

  const handleDragEnd = () => {
    logger.debug('Drag ended', undefined, 'SettingsDialog');
    setDraggedIndex(null);
  };

  const handleConfirmChanges = async () => {
    logger.info('Confirming model configuration changes', {
      stagedCount: stagedModels.length,
      hasChanges,
    }, 'SettingsDialog');

    // Validate: default model must be enabled
    const defaultModel = stagedModels.find(m => m.isDefault);
    if (defaultModel && !defaultModel.isEnabled) {
      const errorMsg = 'Default model must be enabled';
      logger.warn(errorMsg, { defaultModelId: defaultModel.id }, 'SettingsDialog');
      setError(errorMsg);
      return;
    }

    // Validate: at least one model must be enabled
    const hasEnabledModel = stagedModels.some(m => m.isEnabled !== false);
    if (!hasEnabledModel) {
      const errorMsg = 'At least one model must be enabled';
      logger.warn(errorMsg, undefined, 'SettingsDialog');
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
        }, 'SettingsDialog');

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
      logger.error('Failed to save model configurations', { error: errorMessage }, 'SettingsDialog');
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelChanges = () => {
    logger.info('Canceling model configuration changes', undefined, 'SettingsDialog');
    
    // Revert to original models
    setStagedModels(JSON.parse(JSON.stringify(models)));
    setHasChanges(false);
    setError('');
    setSuccess('');
    
    logger.debug('Changes reverted to saved state', undefined, 'SettingsDialog');
  };

  // MCP Handlers
  const handleLoadMCPServers = async () => {
    logger.info('Loading MCP server configurations', undefined, 'SettingsDialog');
    setIsLoading(true);
    setError('');

    try {
      const configList: MCPConfigList = await loadMCPConfigs();
      setMCPServers(configList.mcpServers);
      
      logger.success('MCP server configurations loaded', {
        count: configList.mcpServers.length,
      }, 'SettingsDialog');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load MCP servers';
      logger.error('Failed to load MCP server configurations', { error: errorMessage }, 'SettingsDialog');
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddMCPServer = async () => {
    logger.info('Adding new MCP server', { name: mcpFormName }, 'SettingsDialog');
    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      // Parse args from comma-separated string
      const args = mcpFormArgs.split(',').map(arg => arg.trim()).filter(arg => arg.length > 0);

      // Parse environment variables from JSON string
      let env: Record<string, string> = {};
      if (mcpFormEnv.trim()) {
        try {
          env = JSON.parse(mcpFormEnv);
          if (typeof env !== 'object' || Array.isArray(env)) {
            throw new Error('Environment variables must be a JSON object');
          }
          logger.debug('Parsed environment variables', { count: Object.keys(env).length }, 'SettingsDialog');
        } catch (parseError) {
          throw new Error(`Invalid environment variables JSON: ${parseError instanceof Error ? parseError.message : 'Parse error'}`);
        }
      }

      const result = await addMCPConfig({
        name: mcpFormName.trim(),
        command: mcpFormCommand.trim(),
        args,
        env,
      });

      if (result.success && result.mcp) {
        logger.success('MCP server added successfully', {
          id: result.mcp.id,
          name: result.mcp.name,
          hasEnvVars: Object.keys(env).length > 0,
        }, 'SettingsDialog');

        setSuccess('MCP server added successfully!');
        handleResetMCPForm();
        
        await handleLoadMCPServers();
      } else {
        throw new Error(result.error || 'Failed to add MCP server');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to add MCP server';
      logger.error('Failed to add MCP server', { error: errorMessage }, 'SettingsDialog');
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateMCPServer = async () => {
    if (!editingMCPId) {
      logger.warn('No MCP server ID for update', undefined, 'SettingsDialog');
      return;
    }

    logger.info('Updating MCP server', { id: editingMCPId, name: mcpFormName }, 'SettingsDialog');
    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      // Parse args from comma-separated string
      const args = mcpFormArgs.split(',').map(arg => arg.trim()).filter(arg => arg.length > 0);

      // Parse environment variables from JSON string
      let env: Record<string, string> = {};
      if (mcpFormEnv.trim()) {
        try {
          env = JSON.parse(mcpFormEnv);
          if (typeof env !== 'object' || Array.isArray(env)) {
            throw new Error('Environment variables must be a JSON object');
          }
          logger.debug('Parsed environment variables for update', { count: Object.keys(env).length }, 'SettingsDialog');
        } catch (parseError) {
          throw new Error(`Invalid environment variables JSON: ${parseError instanceof Error ? parseError.message : 'Parse error'}`);
        }
      }

      const result = await updateMCPConfig(editingMCPId, {
        name: mcpFormName.trim(),
        command: mcpFormCommand.trim(),
        args,
        env,
      });

      if (result.success) {
        logger.success('MCP server updated successfully', {
          id: editingMCPId,
          name: mcpFormName,
          hasEnvVars: Object.keys(env).length > 0,
        }, 'SettingsDialog');

        setSuccess('MCP server updated successfully!');
        handleResetMCPForm();
        
        await handleLoadMCPServers();
      } else {
        throw new Error(result.error || 'Failed to update MCP server');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update MCP server';
      logger.error('Failed to update MCP server', { error: errorMessage, id: editingMCPId }, 'SettingsDialog');
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditMCPServer = (mcp: MCPConfig) => {
    logger.info('Entering MCP edit mode', { id: mcp.id, name: mcp.name }, 'SettingsDialog');
    
    setEditingMCPId(mcp.id);
    setIsMCPEditMode(true);
    setMCPFormName(mcp.name);
    setMCPFormCommand(mcp.command);
    setMCPFormArgs(mcp.args.join(', '));
    
    // Set environment variables as formatted JSON string
    if (mcp.env && Object.keys(mcp.env).length > 0) {
      setMCPFormEnv(JSON.stringify(mcp.env, null, 2));
    } else {
      setMCPFormEnv('');
    }
    
    setIsMCPFormVisible(true);
    setError('');
    setSuccess('');
  };

  const handleSubmitMCPForm = () => {
    if (isMCPEditMode) {
      handleUpdateMCPServer();
    } else {
      handleAddMCPServer();
    }
  };

  const handleResetMCPForm = () => {
    logger.debug('Resetting MCP form', undefined, 'SettingsDialog');
    
    setMCPFormName('');
    setMCPFormCommand('');
    setMCPFormArgs('');
    setMCPFormEnv('');
    setIsMCPFormVisible(false);
    setEditingMCPId(null);
    setIsMCPEditMode(false);
  };

  const handleDeleteMCPServer = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete the MCP server "${name}"?`)) {
      logger.debug('Delete MCP server cancelled by user', { id, name }, 'SettingsDialog');
      return;
    }

    logger.info('Deleting MCP server', { id, name }, 'SettingsDialog');
    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      const result = await deleteMCPConfig(id);

      if (result.success) {
        logger.success('MCP server deleted successfully', { id, name }, 'SettingsDialog');
        setSuccess('MCP server deleted successfully!');
        
        await handleLoadMCPServers();
      } else {
        throw new Error(result.error || 'Failed to delete MCP server');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete MCP server';
      logger.error('Failed to delete MCP server', { error: errorMessage, id }, 'SettingsDialog');
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleMCPEnabled = async (id: string, name: string) => {
    logger.info('Toggling MCP server enabled status', { id, name }, 'SettingsDialog');
    
    // Add to starting set
    setMCPStartingIds(prev => new Set(prev).add(id));
    setError('');
    setSuccess('');

    try {
      logger.debug('Calling toggleMCPEnabled API', { id, name }, 'SettingsDialog');
      const result = await toggleMCPEnabled(id);

      if (result.success) {
        logger.success('MCP server toggled successfully', {
          id,
          name,
          isEnabled: result.isEnabled,
        }, 'SettingsDialog');
        
        setSuccess(`MCP server "${name}" ${result.isEnabled ? 'started' : 'stopped'} successfully!`);
        
        // Reload MCP servers to reflect the updated status
        logger.debug('Reloading MCP servers after toggle', { id }, 'SettingsDialog');
        await handleLoadMCPServers();
        
        logger.info('MCP server list reloaded successfully', { id }, 'SettingsDialog');
      } else {
        throw new Error(result.error || 'Failed to toggle MCP server');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to toggle MCP server';
      logger.error('Failed to toggle MCP server', { error: errorMessage, id, name }, 'SettingsDialog');
      setError(errorMessage);
      
      // Reload to ensure UI is in sync with actual state
      logger.debug('Reloading MCP servers after error to sync state', { id }, 'SettingsDialog');
      await handleLoadMCPServers();
    } finally {
      // Remove from starting set
      setMCPStartingIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(id);
        return newSet;
      });
    }
  };

  const handleShowAddMCPForm = () => {
    logger.debug('Showing add MCP server form', undefined, 'SettingsDialog');
    setIsMCPEditMode(false);
    setEditingMCPId(null);
    setIsMCPFormVisible(true);
    setError('');
    setSuccess('');
  };

  const handleCancelMCPForm = () => {
    logger.debug('Canceling MCP form', { isMCPEditMode }, 'SettingsDialog');
    handleResetMCPForm();
    setError('');
  };

  const handleShowJSONPreview = (mcp: MCPConfig) => {
    logger.info('Showing JSON preview for MCP', { id: mcp.id, name: mcp.name }, 'SettingsDialog');
    
    const jsonConfig = {
      mcpServers: {
        [mcp.name]: {
          command: mcp.command,
          args: mcp.args,
          ...(mcp.env && Object.keys(mcp.env).length > 0 ? { env: mcp.env } : {})
        }
      }
    };
    
    setMCPJsonPreview(JSON.stringify(jsonConfig, null, 2));
  };

  const handleCloseJSONPreview = () => {
    setMCPJsonPreview('');
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
            <button
              onClick={() => setActiveTab('mcp')}
              className={`px-3 py-3 text-left text-sm font-medium border-b-2 border-border transition-colors ${
                activeTab === 'mcp'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-foreground hover:bg-secondary'
              }`}
            >
              MCP Config
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
              <div className="flex-1 flex flex-col overflow-hidden p-4 relative">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-foreground">LLM Models</h3>
                  {!isFormVisible && (
                    <div className="flex gap-2">
                      <button
                        onClick={handleClearAllModels}
                        disabled={isLoading || models.length === 0}
                        className="px-4 py-2 bg-destructive text-destructive-foreground border-2 border-border hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        aria-label="Clear All Models"
                        title="Clear All Models"
                      >
                        <XCircle className="w-4 h-4" />
                        <span className="font-medium">Clear All</span>
                      </button>
                      <button
                        onClick={handleShowAddForm}
                        disabled={isLoading}
                        className="px-4 py-2 bg-primary text-primary-foreground border-2 border-border hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        aria-label="Add Model"
                      >
                        <Plus className="w-4 h-4" />
                        <span className="font-medium">Add Model</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Add/Edit Model Form */}
                {isFormVisible && (
                  <div className="mb-4 p-4 bg-card border-4 border-border shadow-sm">
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
                          onClick={handleSubmitForm}
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
                          <span className="font-medium">
                            {isEditMode ? 'Update Model' : 'Save Model'}
                          </span>
                        </button>
                        <button
                          onClick={handleCancelForm}
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
                      {stagedModels.map((model, index) => (
                        <div
                          key={model.id}
                          draggable={!isFormVisible}
                          onDragStart={() => handleDragStart(index)}
                          onDragOver={(e) => handleDragOver(e, index)}
                          onDragEnd={handleDragEnd}
                          className={`p-4 bg-card border-4 border-border shadow-sm hover:shadow-md transition-all cursor-move ${
                            model.isEnabled === false ? 'opacity-60' : ''
                          } ${draggedIndex === index ? 'opacity-50' : ''}`}
                        >
                          <div className="flex items-start justify-between gap-4">
                            {/* Drag Handle */}
                            <div className="flex items-center pt-1">
                              <GripVertical className="w-5 h-5 text-muted-foreground" />
                            </div>

                            {/* Model Info */}
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

                            {/* Action Buttons - Right Side */}
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleEditModel(model)}
                                disabled={isLoading || isFormVisible}
                                className="p-2 bg-blue-600 text-white border-2 border-border hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                aria-label="Edit Model"
                                title="Edit Model"
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteModel(model.id, model.name)}
                                disabled={isLoading || isFormVisible}
                                className="p-2 bg-destructive text-destructive-foreground border-2 border-border hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                aria-label="Delete Model"
                                title="Delete Model"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                              
                              {/* Enable/Disable Toggle Switch */}
                              <button
                                onClick={() => handleStagedToggleEnabled(model.id)}
                                disabled={isLoading || isFormVisible}
                                className={`relative inline-flex h-8 w-14 items-center rounded-full border-2 border-border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
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
                  <div className="absolute bottom-0 left-0 right-0 bg-background border-t-4 border-border p-4 flex items-center justify-end gap-3">
                    <button
                      onClick={handleCancelChanges}
                      disabled={!hasChanges || isLoading}
                      className="px-6 py-2 bg-muted text-foreground border-2 border-border hover:bg-secondary transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleConfirmChanges}
                      disabled={!hasChanges || isLoading}
                      className="px-6 py-2 bg-primary text-primary-foreground border-2 border-border hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-medium"
                    >
                      <Check className="w-4 h-4" />
                      Confirm Changes
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* MCP Config Tab Content */}
            {activeTab === 'mcp' && (
              <div className="flex-1 flex flex-col overflow-hidden p-4 relative">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-foreground">MCP Servers</h3>
                  {!isMCPFormVisible && (
                    <div className="flex gap-2">
                      <button
                        onClick={handleShowAddMCPForm}
                        disabled={isLoading}
                        className="px-4 py-2 bg-primary text-primary-foreground border-2 border-border hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        aria-label="Add MCP Server"
                      >
                        <Plus className="w-4 h-4" />
                        <span className="font-medium">Add MCP Server</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Add/Edit MCP Server Form */}
                {isMCPFormVisible && (
                  <div className="mb-4 p-4 bg-card border-4 border-border shadow-sm">
                    <h4 className="text-md font-bold text-foreground mb-3">
                      {isMCPEditMode ? 'Edit MCP Server' : 'Add New MCP Server'}
                    </h4>
                    
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-foreground mb-1">
                          MCP Server Name *
                        </label>
                        <input
                          type="text"
                          value={mcpFormName}
                          onChange={(e) => setMCPFormName(e.target.value)}
                          placeholder="e.g., tavily-ai-tavily-mcp"
                          className="w-full px-3 py-2 bg-background border-2 border-border text-foreground focus:outline-none focus:border-primary"
                          disabled={isLoading}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-foreground mb-1">
                          Command *
                        </label>
                        <input
                          type="text"
                          value={mcpFormCommand}
                          onChange={(e) => setMCPFormCommand(e.target.value)}
                          placeholder="e.g., npx"
                          className="w-full px-3 py-2 bg-background border-2 border-border text-foreground focus:outline-none focus:border-primary"
                          disabled={isLoading}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-foreground mb-1">
                          Arguments * (comma-separated)
                        </label>
                        <input
                          type="text"
                          value={mcpFormArgs}
                          onChange={(e) => setMCPFormArgs(e.target.value)}
                          placeholder="e.g., -y, tavily-mcp@latest"
                          className="w-full px-3 py-2 bg-background border-2 border-border text-foreground focus:outline-none focus:border-primary"
                          disabled={isLoading}
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Separate arguments with commas. Example: -y, tavily-mcp@latest
                        </p>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-foreground mb-1">
                          Environment Variables (Optional, JSON format)
                        </label>
                        <textarea
                          value={mcpFormEnv}
                          onChange={(e) => setMCPFormEnv(e.target.value)}
                          placeholder='{"TAVILY_API_KEY": "your-api-key-here"}'
                          className="w-full px-3 py-2 bg-background border-2 border-border text-foreground focus:outline-none focus:border-primary font-mono text-sm"
                          disabled={isLoading}
                          rows={4}
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Enter environment variables as JSON object. Example: {`{"API_KEY": "sk-xxx", "DEBUG": "true"}`}
                        </p>
                      </div>

                      <div className="flex gap-2 pt-2">
                        <button
                          onClick={handleSubmitMCPForm}
                          disabled={
                            isLoading ||
                            !mcpFormName.trim() ||
                            !mcpFormCommand.trim() ||
                            !mcpFormArgs.trim()
                          }
                          className="px-4 py-2 bg-primary text-primary-foreground border-2 border-border hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                          <Save className="w-4 h-4" />
                          <span className="font-medium">
                            {isMCPEditMode ? 'Update MCP Server' : 'Save MCP Server'}
                          </span>
                        </button>
                        <button
                          onClick={handleCancelMCPForm}
                          disabled={isLoading}
                          className="px-4 py-2 bg-muted text-foreground border-2 border-border hover:bg-secondary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* MCP Server List */}
                <div className="flex-1 overflow-y-auto">
                  {isLoading && mcpServers.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      Loading MCP servers...
                    </div>
                  ) : mcpServers.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No MCP servers configured. Add your first MCP server to get started.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {mcpServers.map((mcp) => {
                        const isStarting = mcpStartingIds.has(mcp.id);
                        return (
                          <div
                            key={mcp.id}
                            className={`p-4 bg-card border-4 border-border shadow-sm hover:shadow-md transition-all ${
                              !mcp.isEnabled ? 'opacity-60' : ''
                            }`}
                          >
                            <div className="flex items-start justify-between gap-4">
                              {/* MCP Info */}
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2">
                                  <h4 className="text-md font-bold text-foreground">
                                    {mcp.name}
                                  </h4>
                                  {mcp.isEnabled && !isStarting && (
                                    <span className="px-2 py-0.5 bg-green-600 text-white text-xs font-medium border border-border flex items-center gap-1">
                                      <Power className="w-3 h-3" />
                                      Running
                                    </span>
                                  )}
                                  {isStarting && (
                                    <span className="px-2 py-0.5 bg-yellow-600 text-white text-xs font-medium border border-border flex items-center gap-1">
                                      <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                      Starting...
                                    </span>
                                  )}
                                  {!mcp.isEnabled && !isStarting && (
                                    <span className="px-2 py-0.5 bg-muted text-muted-foreground text-xs font-medium border border-border">
                                      Stopped
                                    </span>
                                  )}
                                </div>
                                
                                <div className="space-y-1 text-sm text-muted-foreground">
                                  <div>
                                    <span className="font-medium">Command:</span> {mcp.command}
                                  </div>
                                  <div>
                                    <span className="font-medium">Arguments:</span> {mcp.args.join(' ')}
                                  </div>
                                  {mcp.env && Object.keys(mcp.env).length > 0 && (
                                    <div>
                                      <span className="font-medium">Environment Variables:</span> {Object.keys(mcp.env).length} configured
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Action Buttons - Right Side */}
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => handleShowJSONPreview(mcp)}
                                  disabled={isLoading}
                                  className="px-3 py-2 bg-secondary text-secondary-foreground border-2 border-border hover:bg-secondary/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-xs font-medium"
                                  aria-label="View JSON Configuration"
                                  title="View JSON Configuration"
                                >
                                  JSON
                                </button>
                                <button
                                  onClick={() => handleEditMCPServer(mcp)}
                                  disabled={isLoading || isMCPFormVisible || isStarting}
                                  className="p-2 bg-blue-600 text-white border-2 border-border hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                  aria-label="Edit MCP Server"
                                  title="Edit MCP Server"
                                >
                                  <Edit className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleDeleteMCPServer(mcp.id, mcp.name)}
                                  disabled={isLoading || isMCPFormVisible || mcp.isEnabled || isStarting}
                                  className="p-2 bg-destructive text-destructive-foreground border-2 border-border hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                  aria-label="Delete MCP Server"
                                  title={mcp.isEnabled ? "Stop MCP server before deleting" : "Delete MCP Server"}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                                
                                {/* Start/Stop Button */}
                                <button
                                  onClick={() => handleToggleMCPEnabled(mcp.id, mcp.name)}
                                  disabled={isLoading || isMCPFormVisible || isStarting}
                                  className={`px-3 py-2 border-2 border-border hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 ${
                                    mcp.isEnabled
                                      ? 'bg-red-600 text-white'
                                      : 'bg-green-600 text-white'
                                  }`}
                                  aria-label={mcp.isEnabled ? 'Stop MCP Server' : 'Start MCP Server'}
                                  title={mcp.isEnabled ? 'Stop' : 'Start'}
                                >
                                  {isStarting ? (
                                    <>
                                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                      <span className="text-xs font-medium">Starting</span>
                                    </>
                                  ) : (
                                    <>
                                      <Power className="w-4 h-4" />
                                      <span className="text-xs font-medium">
                                        {mcp.isEnabled ? 'Stop' : 'Start'}
                                      </span>
                                    </>
                                  )}
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* JSON Preview Modal */}
      {mcpJsonPreview && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black bg-opacity-70">
          <div className="bg-background border-4 border-border shadow-lg w-[600px] max-h-[70%] flex flex-col">
            {/* Header */}
            <div className="h-12 bg-primary border-b-4 border-border flex items-center justify-between px-4">
              <h3 className="text-lg font-bold text-primary-foreground">MCP JSON Configuration</h3>
              <button
                onClick={handleCloseJSONPreview}
                className="w-8 h-8 flex items-center justify-center hover:bg-primary-foreground hover:bg-opacity-20 transition-colors"
                aria-label="Close JSON Preview"
              >
                <X className="w-5 h-5 text-primary-foreground" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4">
              <p className="text-sm text-muted-foreground mb-3">
                Copy this configuration to use in your MCP client configuration file:
              </p>
              <pre className="bg-muted p-4 rounded border-2 border-border text-sm font-mono overflow-x-auto">
                {mcpJsonPreview}
              </pre>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(mcpJsonPreview);
                  setSuccess('JSON configuration copied to clipboard!');
                  setTimeout(() => setSuccess(''), 2000);
                }}
                className="mt-4 px-4 py-2 bg-primary text-primary-foreground border-2 border-border hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none shadow-sm transition-all flex items-center gap-2"
              >
                <span className="font-medium">Copy to Clipboard</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SettingsDialog;

