import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, Button, Input, ToolIcon, RefreshIcon, AlertIcon } from '../../components';
import { useTranslation } from '../../hooks/useTranslation';
import {
  listAvailableTools,
  getToolSchema,
  invokeTool,
  type ToolInfo,
  type ToolResult,
} from '../../services/toolsApi';
import { logger } from '../../lib/logger';
import { toast } from '../../stores/toastStore';
import './Tools.css';

export const Tools: React.FC = () => {
  const { t } = useTranslation();
  const [tools, setTools] = useState<ToolInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedTool, setSelectedTool] = useState<ToolInfo | null>(null);
  const [argsJson, setArgsJson] = useState('{}');
  const [schema, setSchema] = useState<Record<string, unknown> | null>(null);
  const [result, setResult] = useState<ToolResult | null>(null);
  const [isInvoking, setIsInvoking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTools = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const list = await listAvailableTools();
      setTools(list);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      logger.error('[Tools] load failed:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTools();
  }, [loadTools]);

  const filteredTools = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tools;
    return tools.filter(
      (tool) =>
        tool.name.toLowerCase().includes(q) ||
        tool.toolset.toLowerCase().includes(q) ||
        (tool.description?.toLowerCase().includes(q) ?? false),
    );
  }, [tools, search]);

  const handleSelectTool = useCallback(async (tool: ToolInfo) => {
    setSelectedTool(tool);
    setResult(null);
    setArgsJson('{}');
    setSchema(null);
    try {
      const s = await getToolSchema(tool.name);
      setSchema(s);
    } catch (err) {
      logger.debug('[Tools] schema load failed:', err);
    }
  }, []);

  const handleInvoke = useCallback(async () => {
    if (!selectedTool) return;
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(argsJson) as Record<string, unknown>;
    } catch {
      toast.error(t('tools.invalidJson'));
      return;
    }

    setIsInvoking(true);
    setResult(null);
    try {
      const res = await invokeTool(selectedTool.name, args);
      setResult(res);
      if (res.success) {
        toast.success(t('tools.invokeSuccess'));
      } else {
        toast.error(res.error || t('tools.invokeFailed'));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg);
    } finally {
      setIsInvoking(false);
    }
  }, [selectedTool, argsJson, t]);

  return (
    <div className="tools-page">
      <div className="tools-header">
        <h1>{t('tools.title')}</h1>
        <div className="tools-header-actions">
          <Input
            placeholder={t('tools.search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Button variant="secondary" onClick={() => void loadTools()} disabled={isLoading}>
            <RefreshIcon size={14} className={isLoading ? 'spinning' : ''} />
            {t('common.refresh')}
          </Button>
        </div>
      </div>

      {error && (
        <div className="error-message">
          <AlertIcon size={16} />
          <span>{error}</span>
        </div>
      )}

      <div className="tools-layout">
        <Card className="tools-list-card">
          <h2>{t('tools.available')}</h2>
          {isLoading ? (
            <div className="tools-loading">
              <div className="loading-spinner" />
            </div>
          ) : filteredTools.length === 0 ? (
            <p className="tools-empty">{t('tools.noTools')}</p>
          ) : (
            <ul className="tools-list" role="list">
              {filteredTools.map((tool) => (
                <li key={`${tool.toolset}-${tool.name}`}>
                  <button
                    type="button"
                    className={`tools-list-item ${selectedTool?.name === tool.name ? 'tools-list-item-active' : ''}`}
                    onClick={() => void handleSelectTool(tool)}
                  >
                    <span className="tools-list-emoji">{tool.emoji || <ToolIcon size={16} />}</span>
                    <span className="tools-list-body">
                      <span className="tools-list-name">{tool.name}</span>
                      <span className="tools-list-meta">{tool.toolset}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="tools-detail-card">
          {!selectedTool ? (
            <p className="tools-empty">{t('tools.selectTool')}</p>
          ) : (
            <>
              <h2>{selectedTool.name}</h2>
              {selectedTool.description && (
                <p className="tools-description">{selectedTool.description}</p>
              )}
              {schema && (
                <details className="tools-schema">
                  <summary>{t('tools.schema')}</summary>
                  <pre>{JSON.stringify(schema, null, 2)}</pre>
                </details>
              )}
              <label className="tools-args-label">{t('tools.argsJson')}</label>
              <textarea
                className="tools-args-input"
                value={argsJson}
                onChange={(e) => setArgsJson(e.target.value)}
                rows={8}
                spellCheck={false}
              />
              <div className="tools-actions">
                <Button variant="primary" onClick={() => void handleInvoke()} disabled={isInvoking}>
                  {isInvoking ? t('tools.invoking') : t('tools.invoke')}
                </Button>
              </div>
              {result && (
                <div className={`tools-result ${result.success ? 'tools-result-ok' : 'tools-result-err'}`}>
                  <h3>{result.success ? t('tools.resultOk') : t('tools.resultErr')}</h3>
                  <pre>
                    {typeof result.output === 'string'
                      ? result.output
                      : JSON.stringify(result.output, null, 2)}
                  </pre>
                  {result.error && <p className="tools-result-error">{result.error}</p>}
                  {result.duration_ms != null && (
                    <span className="tools-duration">{result.duration_ms}ms</span>
                  )}
                </div>
              )}
            </>
          )}
        </Card>
      </div>
    </div>
  );
};
