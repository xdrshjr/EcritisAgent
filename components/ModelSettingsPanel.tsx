/**
 * Model Settings Panel Component
 * Three-tab layout: Standard API / Coding Plan / Custom
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Trash2, Save, Star, Edit, XCircle, ChevronDown } from 'lucide-react';
import { logger } from '@/lib/logger';
import {
  loadModelConfigsByType,
  saveModelConfigsByType,
  loadProviders,
  setDefaultModel,
  generateModelId,
  validateModelConfig,
  type ModelConfig,
  type StandardModelConfig,
  type CodingPlanModelConfig,
  type CustomModelConfig,
  type ModelConfigList,
  type ModelType,
  type ProvidersConfig,
  type StandardProvider,
  type CodingPlanService,
} from '@/lib/modelConfig';
import { syncModelConfigsToCookies } from '@/lib/modelConfigSync';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

interface ModelSettingsPanelProps {
  className?: string;
}

type ActiveTab = 'standard' | 'codingPlan' | 'custom';

const ModelSettingsPanel = ({ className }: ModelSettingsPanelProps) => {
  const { locale } = useLanguage();
  const dict = getDictionary(locale);
  const t = dict.settings.modelForm;
  const tabs = dict.settings.modelTabs;

  // ── Per-type model state ────────────────────────────────────────────────
  const [standardModels, setStandardModels] = useState<StandardModelConfig[]>([]);
  const [codingPlanModels, setCodingPlanModels] = useState<CodingPlanModelConfig[]>([]);
  const [customModels, setCustomModels] = useState<CustomModelConfig[]>([]);

  // Staged (editing) copies
  const [stagedStandard, setStagedStandard] = useState<StandardModelConfig[]>([]);
  const [stagedCodingPlan, setStagedCodingPlan] = useState<CodingPlanModelConfig[]>([]);
  const [stagedCustom, setStagedCustom] = useState<CustomModelConfig[]>([]);

  // Provider templates
  const [providers, setProviders] = useState<ProvidersConfig>({ standard: [], codingPlan: [] });

  // UI state
  const [activeTab, setActiveTab] = useState<ActiveTab>('standard');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Form state
  const [isFormVisible, setIsFormVisible] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingModelId, setEditingModelId] = useState<string | null>(null);
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);

  // Form fields
  const [formName, setFormName] = useState('');
  const [formApiUrl, setFormApiUrl] = useState('');
  const [formApiKey, setFormApiKey] = useState('');
  const [formModelName, setFormModelName] = useState('');
  const [formMaxToken, setFormMaxToken] = useState('');

  // Combobox state
  const [comboOpen, setComboOpen] = useState(false);
  const [comboFilter, setComboFilter] = useState('');
  const comboRef = useRef<HTMLDivElement>(null);

  // ── Derived ─────────────────────────────────────────────────────────────

  const hasChanges =
    JSON.stringify(stagedStandard) !== JSON.stringify(standardModels) ||
    JSON.stringify(stagedCodingPlan) !== JSON.stringify(codingPlanModels) ||
    JSON.stringify(stagedCustom) !== JSON.stringify(customModels);

  const selectedProvider: StandardProvider | undefined = providers.standard.find(
    (p) => p.id === selectedProviderId,
  );

  const selectedService: CodingPlanService | undefined = providers.codingPlan.find(
    (s) => s.id === selectedServiceId,
  );

  // ── Load data on mount ──────────────────────────────────────────────────

  useEffect(() => {
    logger.component('ModelSettingsPanel', 'mounted');
    handleLoadAll();
  }, []);

  // Close combobox on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (comboRef.current && !comboRef.current.contains(e.target as Node)) {
        setComboOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLoadAll = async () => {
    setIsLoading(true);
    setError('');
    try {
      const [stdRes, cpRes, cusRes, provRes] = await Promise.all([
        loadModelConfigsByType('standard'),
        loadModelConfigsByType('codingPlan'),
        loadModelConfigsByType('custom'),
        loadProviders(),
      ]);

      const std = (stdRes.models || []) as StandardModelConfig[];
      const cp = (cpRes.models || []) as CodingPlanModelConfig[];
      const cus = (cusRes.models || []) as CustomModelConfig[];

      setStandardModels(std);
      setCodingPlanModels(cp);
      setCustomModels(cus);
      setStagedStandard(structuredClone(std));
      setStagedCodingPlan(structuredClone(cp));
      setStagedCustom(structuredClone(cus));
      setProviders(provRes);

      logger.success('All model configurations loaded', {
        standard: std.length,
        codingPlan: cp.length,
        custom: cus.length,
      }, 'ModelSettingsPanel');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load models';
      logger.error('Failed to load model configurations', { error: msg }, 'ModelSettingsPanel');
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  // ── Form helpers ────────────────────────────────────────────────────────

  const resetForm = useCallback(() => {
    setFormName('');
    setFormApiUrl('');
    setFormApiKey('');
    setFormModelName('');
    setFormMaxToken('');
    setIsFormVisible(false);
    setIsEditMode(false);
    setEditingModelId(null);
    setSelectedProviderId(null);
    setSelectedServiceId(null);
    setComboOpen(false);
    setComboFilter('');
  }, []);

  const showMessage = useCallback((msg: string, type: 'success' | 'error') => {
    if (type === 'success') {
      setSuccess(msg);
      setError('');
    } else {
      setError(msg);
      setSuccess('');
    }
    setTimeout(() => {
      setSuccess('');
      setError('');
    }, 3000);
  }, []);

  // Auto-generate display name
  const autoGenerateName = useCallback((providerOrService: string, model: string) => {
    if (providerOrService && model) return `${providerOrService} - ${model}`;
    if (providerOrService) return providerOrService;
    return model;
  }, []);

  // ── Standard API handlers ───────────────────────────────────────────────

  const handleSelectProvider = (providerId: string) => {
    const provider = providers.standard.find((p) => p.id === providerId);
    if (!provider) return;
    setSelectedProviderId(providerId);
    setFormApiUrl(provider.apiUrl);
    setFormModelName('');
    setFormName('');
    setIsFormVisible(true);
    setError('');
    setSuccess('');
  };

  const handleStandardSubmit = () => {
    if (!selectedProvider) return;
    const now = new Date().toISOString();

    if (isEditMode && editingModelId) {
      // Update existing
      setStagedStandard((prev) =>
        prev.map((m) =>
          m.id === editingModelId
            ? {
                ...m,
                name: formName.trim(),
                apiUrl: formApiUrl.trim(),
                apiKey: formApiKey.trim(),
                modelName: formModelName.trim(),
                maxToken: formMaxToken.trim() ? parseInt(formMaxToken.trim(), 10) : undefined,
                updatedAt: now,
              }
            : m,
        ),
      );
      showMessage(t.updatedSuccess, 'success');
    } else {
      // Add new
      const newModel: StandardModelConfig = {
        id: generateModelId(),
        type: 'standard',
        providerId: selectedProvider.id,
        name: formName.trim() || autoGenerateName(selectedProvider.name, formModelName.trim()),
        apiUrl: formApiUrl.trim(),
        apiKey: formApiKey.trim(),
        modelName: formModelName.trim(),
        maxToken: formMaxToken.trim() ? parseInt(formMaxToken.trim(), 10) : undefined,
        isEnabled: true,
        isDefault: stagedStandard.length === 0 && stagedCodingPlan.length === 0 && stagedCustom.length === 0,
        createdAt: now,
        updatedAt: now,
      };
      setStagedStandard((prev) => [...prev, newModel]);
      showMessage(t.addedSuccess, 'success');
    }
    resetForm();
  };

  const handleEditStandard = (model: StandardModelConfig) => {
    setEditingModelId(model.id);
    setIsEditMode(true);
    setSelectedProviderId(model.providerId);
    setFormName(model.name);
    setFormApiUrl(model.apiUrl);
    setFormApiKey(model.apiKey);
    setFormModelName(model.modelName);
    setFormMaxToken(model.maxToken?.toString() || '');
    setIsFormVisible(true);
    setError('');
    setSuccess('');
  };

  // ── Coding Plan handlers ────────────────────────────────────────────────

  const handleSelectService = (serviceId: string) => {
    const service = providers.codingPlan.find((s) => s.id === serviceId);
    if (!service) return;
    setSelectedServiceId(serviceId);
    setFormName(autoGenerateName(service.name, service.model));
    setFormApiKey('');
    setIsFormVisible(true);
    setError('');
    setSuccess('');
  };

  const handleCodingPlanSubmit = () => {
    if (!selectedService) return;
    const now = new Date().toISOString();

    if (isEditMode && editingModelId) {
      setStagedCodingPlan((prev) =>
        prev.map((m) =>
          m.id === editingModelId
            ? {
                ...m,
                name: formName.trim(),
                apiKey: formApiKey.trim(),
                updatedAt: now,
              }
            : m,
        ),
      );
      showMessage(t.updatedSuccess, 'success');
    } else {
      const newModel: CodingPlanModelConfig = {
        id: generateModelId(),
        type: 'codingPlan',
        serviceId: selectedService.id,
        name: formName.trim() || autoGenerateName(selectedService.name, selectedService.model),
        apiKey: formApiKey.trim(),
        isEnabled: true,
        isDefault: stagedStandard.length === 0 && stagedCodingPlan.length === 0 && stagedCustom.length === 0,
        createdAt: now,
        updatedAt: now,
      };
      setStagedCodingPlan((prev) => [...prev, newModel]);
      showMessage(t.addedSuccess, 'success');
    }
    resetForm();
  };

  const handleEditCodingPlan = (model: CodingPlanModelConfig) => {
    setEditingModelId(model.id);
    setIsEditMode(true);
    setSelectedServiceId(model.serviceId);
    setFormName(model.name);
    setFormApiKey(model.apiKey);
    setIsFormVisible(true);
    setError('');
    setSuccess('');
  };

  // ── Custom handlers ─────────────────────────────────────────────────────

  const handleShowCustomForm = () => {
    setIsEditMode(false);
    setEditingModelId(null);
    setIsFormVisible(true);
    setError('');
    setSuccess('');
  };

  const handleCustomSubmit = () => {
    const now = new Date().toISOString();

    if (isEditMode && editingModelId) {
      setStagedCustom((prev) =>
        prev.map((m) =>
          m.id === editingModelId
            ? {
                ...m,
                name: formName.trim(),
                apiUrl: formApiUrl.trim(),
                apiKey: formApiKey.trim(),
                modelName: formModelName.trim(),
                maxToken: formMaxToken.trim() ? parseInt(formMaxToken.trim(), 10) : undefined,
                updatedAt: now,
              }
            : m,
        ),
      );
      showMessage(t.updatedSuccess, 'success');
    } else {
      const newModel: CustomModelConfig = {
        id: generateModelId(),
        type: 'custom',
        name: formName.trim(),
        apiUrl: formApiUrl.trim(),
        apiKey: formApiKey.trim(),
        modelName: formModelName.trim(),
        maxToken: formMaxToken.trim() ? parseInt(formMaxToken.trim(), 10) : undefined,
        isEnabled: true,
        isDefault: stagedStandard.length === 0 && stagedCodingPlan.length === 0 && stagedCustom.length === 0,
        createdAt: now,
        updatedAt: now,
      };
      setStagedCustom((prev) => [...prev, newModel]);
      showMessage(t.addedSuccess, 'success');
    }
    resetForm();
  };

  const handleEditCustom = (model: CustomModelConfig) => {
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

  // ── Cross-tab operations ────────────────────────────────────────────────

  const handleDeleteModel = (id: string, name: string, type: ActiveTab) => {
    if (!confirm(t.deleteConfirm.replace('{name}', name))) return;
    if (type === 'standard') setStagedStandard((prev) => prev.filter((m) => m.id !== id));
    else if (type === 'codingPlan') setStagedCodingPlan((prev) => prev.filter((m) => m.id !== id));
    else setStagedCustom((prev) => prev.filter((m) => m.id !== id));
    showMessage(t.deletedSuccess, 'success');
  };

  const handleSetDefault = (id: string, name: string) => {
    // Clear isDefault in all staged arrays, then set the target
    const clearDefault = <T extends ModelConfig>(arr: T[]): T[] =>
      arr.map((m) => ({ ...m, isDefault: m.id === id }));

    setStagedStandard(clearDefault);
    setStagedCodingPlan(clearDefault);
    setStagedCustom(clearDefault);
    showMessage(`"${name}" ${t.setDefault}`, 'success');
  };

  const handleToggleEnabled = (id: string, type: ActiveTab) => {
    const toggle = <T extends ModelConfig>(arr: T[]): T[] =>
      arr.map((m) => (m.id === id ? { ...m, isEnabled: m.isEnabled === false ? true : false } : m));

    if (type === 'standard') setStagedStandard(toggle);
    else if (type === 'codingPlan') setStagedCodingPlan(toggle);
    else setStagedCustom(toggle);
  };

  // ── Confirm / Cancel ────────────────────────────────────────────────────

  const handleConfirmChanges = async () => {
    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      const saves: Promise<{ success: boolean; error?: string }>[] = [];

      if (JSON.stringify(stagedStandard) !== JSON.stringify(standardModels)) {
        const defaultId = stagedStandard.find((m) => m.isDefault)?.id
          || stagedCodingPlan.find((m) => m.isDefault)?.id
          || stagedCustom.find((m) => m.isDefault)?.id;
        saves.push(
          saveModelConfigsByType('standard', { models: stagedStandard, defaultModelId: defaultId }),
        );
      }
      if (JSON.stringify(stagedCodingPlan) !== JSON.stringify(codingPlanModels)) {
        const defaultId = stagedStandard.find((m) => m.isDefault)?.id
          || stagedCodingPlan.find((m) => m.isDefault)?.id
          || stagedCustom.find((m) => m.isDefault)?.id;
        saves.push(
          saveModelConfigsByType('codingPlan', { models: stagedCodingPlan, defaultModelId: defaultId }),
        );
      }
      if (JSON.stringify(stagedCustom) !== JSON.stringify(customModels)) {
        const defaultId = stagedStandard.find((m) => m.isDefault)?.id
          || stagedCodingPlan.find((m) => m.isDefault)?.id
          || stagedCustom.find((m) => m.isDefault)?.id;
        saves.push(
          saveModelConfigsByType('custom', { models: stagedCustom, defaultModelId: defaultId }),
        );
      }

      const results = await Promise.all(saves);
      const failed = results.find((r) => !r.success);
      if (failed) {
        throw new Error(failed.error || 'Failed to save configurations');
      }

      // Commit staged to saved
      setStandardModels(structuredClone(stagedStandard));
      setCodingPlanModels(structuredClone(stagedCodingPlan));
      setCustomModels(structuredClone(stagedCustom));

      await syncModelConfigsToCookies();
      showMessage(t.savedSuccess, 'success');
      logger.success('Model configurations saved', undefined, 'ModelSettingsPanel');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save';
      logger.error('Failed to save model configurations', { error: msg }, 'ModelSettingsPanel');
      showMessage(msg, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelChanges = () => {
    setStagedStandard(structuredClone(standardModels));
    setStagedCodingPlan(structuredClone(codingPlanModels));
    setStagedCustom(structuredClone(customModels));
    resetForm();
  };

  // ── Combobox for model selection ────────────────────────────────────────

  const modelOptions = selectedProvider?.models || [];
  const filteredModels = comboFilter
    ? modelOptions.filter((m) => m.toLowerCase().includes(comboFilter.toLowerCase()))
    : modelOptions;

  const handleModelSelect = (model: string) => {
    setFormModelName(model);
    setComboFilter('');
    setComboOpen(false);
    // Auto-generate name if empty
    if (!formName && selectedProvider) {
      setFormName(autoGenerateName(selectedProvider.name, model));
    }
  };

  const handleModelInputChange = (value: string) => {
    setFormModelName(value);
    setComboFilter(value);
    setComboOpen(true);
    // Auto-update name
    if (selectedProvider && !isEditMode) {
      setFormName(autoGenerateName(selectedProvider.name, value));
    }
  };

  // ── Render helpers ──────────────────────────────────────────────────────

  const renderModelCard = (
    model: ModelConfig,
    type: ActiveTab,
    onEdit: () => void,
    extra?: React.ReactNode,
  ) => {
    const providerLabel =
      type === 'standard'
        ? providers.standard.find((p) => p.id === (model as StandardModelConfig).providerId)?.name
        : type === 'codingPlan'
        ? providers.codingPlan.find((s) => s.id === (model as CodingPlanModelConfig).serviceId)?.name
        : undefined;

    return (
      <div
        key={model.id}
        className={cn(
          'p-3 bg-card border border-border rounded-md shadow-sm hover:shadow-md transition-all',
          model.isEnabled === false && 'opacity-60',
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <h4 className="text-sm font-bold text-foreground truncate">{model.name}</h4>
              {providerLabel && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  {providerLabel}
                </Badge>
              )}
              {model.isDefault && (
                <Badge className="text-[10px] px-1.5 py-0 gap-0.5">
                  <Star className="w-2.5 h-2.5" />
                  {t.default}
                </Badge>
              )}
              {model.isEnabled === false && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                  {dict.settings.disabled}
                </Badge>
              )}
            </div>
            <div className="space-y-0.5 text-xs text-muted-foreground">
              {extra}
              <div>{t.apiKey}: ••••••••</div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {!model.isDefault && (
              <button
                onClick={() => handleSetDefault(model.id, model.name)}
                disabled={isLoading || isFormVisible}
                className="px-2 py-1 text-[10px] bg-muted text-muted-foreground border border-border rounded hover:bg-accent hover:text-accent-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label={t.setDefault}
              >
                {t.setDefault}
              </button>
            )}
            <button
              onClick={onEdit}
              disabled={isLoading || isFormVisible}
              className="p-1.5 bg-blue-600 text-white border border-border rounded shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label={t.editModel}
            >
              <Edit className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => handleDeleteModel(model.id, model.name, type)}
              disabled={isLoading || isFormVisible}
              className="p-1.5 bg-destructive text-destructive-foreground border border-border rounded shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label={dict.settings.delete}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            <Switch
              checked={model.isEnabled !== false}
              onCheckedChange={() => handleToggleEnabled(model.id, type)}
              disabled={isLoading || isFormVisible}
              aria-label={model.isEnabled !== false ? 'Disable' : 'Enable'}
            />
          </div>
        </div>
      </div>
    );
  };

  // ── Standard API tab content ────────────────────────────────────────────

  const renderStandardTab = () => (
    <div className="space-y-3">
      {/* Provider selector (when no form) */}
      {!isFormVisible && (
        <>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">{t.selectProvider}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {providers.standard.map((provider) => (
              <button
                key={provider.id}
                onClick={() => handleSelectProvider(provider.id)}
                disabled={isLoading}
                className="p-2.5 bg-card border border-border rounded-md hover:border-primary hover:bg-accent/50 transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label={`${t.selectProvider}: ${provider.name}`}
              >
                <div className="text-sm font-medium text-foreground">{provider.name}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {provider.models.length} models
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      {/* Standard form */}
      {isFormVisible && selectedProviderId && (
        <div className="p-3 bg-card border border-border rounded-md shadow-sm">
          <h4 className="text-sm font-bold text-foreground mb-2">
            {isEditMode ? t.editModel : t.addStandard}
          </h4>
          <div className="space-y-2">
            {/* Provider (read-only) */}
            <div>
              <label className="block text-xs font-medium text-foreground mb-0.5">
                {t.provider}
              </label>
              <div className="px-2.5 py-1.5 bg-muted border border-border rounded text-sm text-foreground">
                {selectedProvider?.name}
              </div>
            </div>

            {/* API URL */}
            <div>
              <label className="block text-xs font-medium text-foreground mb-0.5">
                {t.apiUrl} *
              </label>
              <input
                type="url"
                value={formApiUrl}
                onChange={(e) => setFormApiUrl(e.target.value)}
                placeholder="https://api.openai.com/v1"
                className="w-full px-2.5 py-1.5 bg-background border border-border rounded text-sm text-foreground focus:outline-none focus:border-primary"
                disabled={isLoading}
              />
            </div>

            {/* API Key */}
            <div>
              <label className="block text-xs font-medium text-foreground mb-0.5">
                {t.apiKey} *
              </label>
              <input
                type="password"
                value={formApiKey}
                onChange={(e) => setFormApiKey(e.target.value)}
                placeholder="sk-..."
                className="w-full px-2.5 py-1.5 bg-background border border-border rounded text-sm text-foreground focus:outline-none focus:border-primary"
                disabled={isLoading}
              />
            </div>

            {/* Model (combobox) */}
            <div>
              <label className="block text-xs font-medium text-foreground mb-0.5">
                {t.modelName} *
              </label>
              <div className="relative" ref={comboRef}>
                <div className="flex">
                  <input
                    type="text"
                    value={formModelName}
                    onChange={(e) => handleModelInputChange(e.target.value)}
                    onFocus={() => setComboOpen(true)}
                    placeholder={t.modelOrType}
                    className="w-full px-2.5 py-1.5 bg-background border border-border rounded-l text-sm text-foreground focus:outline-none focus:border-primary"
                    disabled={isLoading}
                  />
                  <button
                    type="button"
                    onClick={() => setComboOpen(!comboOpen)}
                    className="px-2 bg-background border border-l-0 border-border rounded-r hover:bg-muted transition-colors"
                    aria-label="Toggle model list"
                    tabIndex={-1}
                  >
                    <ChevronDown className={cn('w-3.5 h-3.5 text-muted-foreground transition-transform', comboOpen && 'rotate-180')} />
                  </button>
                </div>
                {comboOpen && filteredModels.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-card border border-border rounded-md shadow-lg max-h-40 overflow-y-auto">
                    {filteredModels.map((model) => (
                      <button
                        key={model}
                        onClick={() => handleModelSelect(model)}
                        className={cn(
                          'w-full px-2.5 py-1.5 text-left text-sm hover:bg-accent transition-colors',
                          formModelName === model && 'bg-accent font-medium',
                        )}
                      >
                        {model}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Display Name */}
            <div>
              <label className="block text-xs font-medium text-foreground mb-0.5">
                {t.displayName} *
              </label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g., GPT-4o"
                className="w-full px-2.5 py-1.5 bg-background border border-border rounded text-sm text-foreground focus:outline-none focus:border-primary"
                disabled={isLoading}
              />
            </div>

            {/* Max Token */}
            <div>
              <label className="block text-xs font-medium text-foreground mb-0.5">
                {t.maxToken} ({dict.settings.optional})
              </label>
              <input
                type="number"
                value={formMaxToken}
                onChange={(e) => setFormMaxToken(e.target.value)}
                min="1"
                className="w-full px-2.5 py-1.5 bg-background border border-border rounded text-sm text-foreground focus:outline-none focus:border-primary"
                disabled={isLoading}
              />
              <p className="text-[10px] text-muted-foreground mt-0.5">{t.maxTokenHint}</p>
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleStandardSubmit}
                disabled={isLoading || !formApiUrl.trim() || !formApiKey.trim() || !formModelName.trim()}
                className="px-3 py-1.5 bg-primary text-primary-foreground border border-border rounded shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 text-sm font-medium"
              >
                <Save className="w-3.5 h-3.5" />
                {isEditMode ? t.updateModel : t.saveModel}
              </button>
              <button
                onClick={resetForm}
                disabled={isLoading}
                className="px-3 py-1.5 bg-muted text-foreground border border-border rounded hover:bg-secondary transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                {dict.settings.cancel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Model list */}
      <div className="space-y-2">
        {stagedStandard.map((model) =>
          renderModelCard(model, 'standard', () => handleEditStandard(model), (
            <>
              <div>{t.modelName}: {model.modelName}</div>
              <div>{t.apiUrl}: {model.apiUrl}</div>
            </>
          )),
        )}
        {stagedStandard.length === 0 && !isFormVisible && (
          <div className="text-center py-6 text-sm text-muted-foreground">
            <div>{t.noModels}</div>
            <div className="text-xs mt-1">{t.noModelsHint}</div>
          </div>
        )}
      </div>
    </div>
  );

  // ── Coding Plan tab content ─────────────────────────────────────────────

  const renderCodingPlanTab = () => (
    <div className="space-y-3">
      {/* Service selector */}
      {!isFormVisible && (
        <>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">{t.selectService}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {providers.codingPlan.map((service) => (
              <button
                key={service.id}
                onClick={() => handleSelectService(service.id)}
                disabled={isLoading}
                className="p-2.5 bg-card border border-border rounded-md hover:border-primary hover:bg-accent/50 transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label={`${t.selectService}: ${service.name}`}
              >
                <div className="text-sm font-medium text-foreground">{service.name}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">{service.model}</div>
              </button>
            ))}
          </div>
        </>
      )}

      {/* Coding Plan form */}
      {isFormVisible && selectedServiceId && (
        <div className="p-3 bg-card border border-border rounded-md shadow-sm">
          <h4 className="text-sm font-bold text-foreground mb-2">
            {isEditMode ? t.editModel : t.addCodingPlan}
          </h4>
          <div className="space-y-2">
            {/* Service (read-only) */}
            <div>
              <label className="block text-xs font-medium text-foreground mb-0.5">
                {t.service}
              </label>
              <div className="px-2.5 py-1.5 bg-muted border border-border rounded text-sm text-foreground">
                {selectedService?.name}
              </div>
            </div>

            {/* Model (read-only) */}
            <div>
              <label className="block text-xs font-medium text-foreground mb-0.5">
                {t.modelName} ({t.fixedModel})
              </label>
              <div className="px-2.5 py-1.5 bg-muted border border-border rounded text-sm text-foreground">
                {selectedService?.model}
              </div>
            </div>

            {/* API Key */}
            <div>
              <label className="block text-xs font-medium text-foreground mb-0.5">
                {t.apiKey} *
              </label>
              <input
                type="password"
                value={formApiKey}
                onChange={(e) => setFormApiKey(e.target.value)}
                placeholder="sk-..."
                className="w-full px-2.5 py-1.5 bg-background border border-border rounded text-sm text-foreground focus:outline-none focus:border-primary"
                disabled={isLoading}
              />
            </div>

            {/* Display Name */}
            <div>
              <label className="block text-xs font-medium text-foreground mb-0.5">
                {t.displayName} *
              </label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-background border border-border rounded text-sm text-foreground focus:outline-none focus:border-primary"
                disabled={isLoading}
              />
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleCodingPlanSubmit}
                disabled={isLoading || !formApiKey.trim()}
                className="px-3 py-1.5 bg-primary text-primary-foreground border border-border rounded shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 text-sm font-medium"
              >
                <Save className="w-3.5 h-3.5" />
                {isEditMode ? t.updateModel : t.saveModel}
              </button>
              <button
                onClick={resetForm}
                disabled={isLoading}
                className="px-3 py-1.5 bg-muted text-foreground border border-border rounded hover:bg-secondary transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                {dict.settings.cancel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Model list */}
      <div className="space-y-2">
        {stagedCodingPlan.map((model) => {
          const service = providers.codingPlan.find((s) => s.id === model.serviceId);
          return renderModelCard(model, 'codingPlan', () => handleEditCodingPlan(model), (
            <>
              {service && <div>{t.modelName}: {service.model}</div>}
            </>
          ));
        })}
        {stagedCodingPlan.length === 0 && !isFormVisible && (
          <div className="text-center py-6 text-sm text-muted-foreground">
            <div>{t.noModels}</div>
            <div className="text-xs mt-1">{t.noModelsHint}</div>
          </div>
        )}
      </div>
    </div>
  );

  // ── Custom tab content ──────────────────────────────────────────────────

  const renderCustomTab = () => (
    <div className="space-y-3">
      {/* Add button */}
      {!isFormVisible && (
        <button
          onClick={handleShowCustomForm}
          disabled={isLoading}
          className="w-full px-3 py-2 bg-primary text-primary-foreground border border-border rounded-md shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 text-sm font-medium"
          aria-label={t.addCustom}
        >
          <Plus className="w-3.5 h-3.5" />
          {t.addCustom}
        </button>
      )}

      {/* Custom form */}
      {isFormVisible && activeTab === 'custom' && (
        <div className="p-3 bg-card border border-border rounded-md shadow-sm">
          <h4 className="text-sm font-bold text-foreground mb-2">
            {isEditMode ? t.editModel : t.addCustom}
          </h4>
          <div className="space-y-2">
            {/* Display Name */}
            <div>
              <label className="block text-xs font-medium text-foreground mb-0.5">
                {t.displayName} *
              </label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g., My Custom Model"
                className="w-full px-2.5 py-1.5 bg-background border border-border rounded text-sm text-foreground focus:outline-none focus:border-primary"
                disabled={isLoading}
              />
            </div>

            {/* API URL */}
            <div>
              <label className="block text-xs font-medium text-foreground mb-0.5">
                {t.apiUrl} *
              </label>
              <input
                type="url"
                value={formApiUrl}
                onChange={(e) => setFormApiUrl(e.target.value)}
                placeholder="https://api.example.com/v1"
                className="w-full px-2.5 py-1.5 bg-background border border-border rounded text-sm text-foreground focus:outline-none focus:border-primary"
                disabled={isLoading}
              />
            </div>

            {/* Model Name */}
            <div>
              <label className="block text-xs font-medium text-foreground mb-0.5">
                {t.modelName} *
              </label>
              <input
                type="text"
                value={formModelName}
                onChange={(e) => setFormModelName(e.target.value)}
                placeholder="e.g., my-model-v1"
                className="w-full px-2.5 py-1.5 bg-background border border-border rounded text-sm text-foreground focus:outline-none focus:border-primary"
                disabled={isLoading}
              />
            </div>

            {/* API Key */}
            <div>
              <label className="block text-xs font-medium text-foreground mb-0.5">
                {t.apiKey} *
              </label>
              <input
                type="password"
                value={formApiKey}
                onChange={(e) => setFormApiKey(e.target.value)}
                placeholder="sk-..."
                className="w-full px-2.5 py-1.5 bg-background border border-border rounded text-sm text-foreground focus:outline-none focus:border-primary"
                disabled={isLoading}
              />
            </div>

            {/* Max Token */}
            <div>
              <label className="block text-xs font-medium text-foreground mb-0.5">
                {t.maxToken} ({dict.settings.optional})
              </label>
              <input
                type="number"
                value={formMaxToken}
                onChange={(e) => setFormMaxToken(e.target.value)}
                min="1"
                className="w-full px-2.5 py-1.5 bg-background border border-border rounded text-sm text-foreground focus:outline-none focus:border-primary"
                disabled={isLoading}
              />
              <p className="text-[10px] text-muted-foreground mt-0.5">{t.maxTokenHint}</p>
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleCustomSubmit}
                disabled={
                  isLoading || !formName.trim() || !formApiUrl.trim() || !formApiKey.trim() || !formModelName.trim()
                }
                className="px-3 py-1.5 bg-primary text-primary-foreground border border-border rounded shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 text-sm font-medium"
              >
                <Save className="w-3.5 h-3.5" />
                {isEditMode ? t.updateModel : t.saveModel}
              </button>
              <button
                onClick={resetForm}
                disabled={isLoading}
                className="px-3 py-1.5 bg-muted text-foreground border border-border rounded hover:bg-secondary transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                {dict.settings.cancel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Model list */}
      <div className="space-y-2">
        {stagedCustom.map((model) =>
          renderModelCard(model, 'custom', () => handleEditCustom(model), (
            <>
              <div>{t.modelName}: {model.modelName}</div>
              <div>{t.apiUrl}: {model.apiUrl}</div>
            </>
          )),
        )}
        {stagedCustom.length === 0 && !isFormVisible && (
          <div className="text-center py-6 text-sm text-muted-foreground">
            <div>{t.noModels}</div>
            <div className="text-xs mt-1">{t.noModelsHint}</div>
          </div>
        )}
      </div>
    </div>
  );

  // ── Main render ─────────────────────────────────────────────────────────

  return (
    <div className={cn('h-full flex flex-col overflow-hidden p-4 relative', className)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-bold text-foreground">{t.title}</h3>
      </div>

      {/* Messages */}
      {error && (
        <div className="mb-3 p-2 bg-destructive border border-border rounded text-destructive-foreground text-xs">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-3 p-2 bg-secondary border border-border rounded text-secondary-foreground text-xs">
          {success}
        </div>
      )}

      {isLoading && stagedStandard.length === 0 && stagedCodingPlan.length === 0 && stagedCustom.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">{t.loading}</div>
      ) : (
        <>
          {/* Tabs */}
          <Tabs
            value={activeTab}
            onValueChange={(v) => {
              setActiveTab(v as ActiveTab);
              resetForm();
            }}
            className="flex-1 flex flex-col overflow-hidden"
          >
            <TabsList className="w-full justify-start mb-3">
              <TabsTrigger value="standard" className="gap-1.5">
                {tabs.standard}
                <Badge variant="secondary" className="text-[10px] px-1 py-0 min-w-[18px] justify-center">
                  {stagedStandard.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="codingPlan" className="gap-1.5">
                {tabs.codingPlan}
                <Badge variant="secondary" className="text-[10px] px-1 py-0 min-w-[18px] justify-center">
                  {stagedCodingPlan.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="custom" className="gap-1.5">
                {tabs.custom}
                <Badge variant="secondary" className="text-[10px] px-1 py-0 min-w-[18px] justify-center">
                  {stagedCustom.length}
                </Badge>
              </TabsTrigger>
            </TabsList>

            <div className="flex-1 overflow-y-auto pb-16">
              <TabsContent value="standard" className="mt-0">
                {renderStandardTab()}
              </TabsContent>
              <TabsContent value="codingPlan" className="mt-0">
                {renderCodingPlanTab()}
              </TabsContent>
              <TabsContent value="custom" className="mt-0">
                {renderCustomTab()}
              </TabsContent>
            </div>
          </Tabs>
        </>
      )}

      {/* Bottom Action Bar */}
      {hasChanges && !isFormVisible && (
        <div className="absolute bottom-0 left-0 right-0 bg-background border-t border-border p-3 flex items-center justify-end gap-2">
          <button
            onClick={handleCancelChanges}
            disabled={isLoading}
            className="px-4 py-1.5 bg-muted text-foreground border border-border rounded hover:bg-secondary transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
          >
            {dict.settings.cancel}
          </button>
          <button
            onClick={handleConfirmChanges}
            disabled={isLoading}
            className="px-4 py-1.5 bg-primary text-primary-foreground border border-border rounded shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 text-sm font-medium"
          >
            <Save className="w-3.5 h-3.5" />
            {t.confirmChanges}
          </button>
        </div>
      )}
    </div>
  );
};

export default ModelSettingsPanel;
