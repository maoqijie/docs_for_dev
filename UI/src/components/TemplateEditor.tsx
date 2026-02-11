import { useState, useEffect } from 'react';
import { safeInvoke } from '../lib/tauri';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Card } from './ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';

interface PromptTemplate {
  name: string;
  content: string;
  variables: string[];
  description: string;
}

export function TemplateEditor() {
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [currentContent, setCurrentContent] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // 加载所有模板
  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      const result = await safeInvoke<PromptTemplate[]>('list_templates');
      setTemplates(result);
      if (result.length > 0 && !selectedTemplate) {
        setSelectedTemplate(result[0].name);
      }
    } catch (error) {
      showMessage('error', `加载模板失败: ${error}`);
    }
  };

  // 当选择的模板改变时，加载其内容
  useEffect(() => {
    if (selectedTemplate) {
      loadTemplate(selectedTemplate);
    }
  }, [selectedTemplate]);

  const loadTemplate = async (name: string) => {
    try {
      const template = await safeInvoke<PromptTemplate>('get_template', { name });
      setCurrentContent(template.content);
    } catch (error) {
      showMessage('error', `加载模板内容失败: ${error}`);
    }
  };

  const handleSave = async () => {
    if (!selectedTemplate) {
      showMessage('error', '请先选择一个模板');
      return;
    }

    setIsSaving(true);
    try {
      await safeInvoke('update_template', {
        name: selectedTemplate,
        content: currentContent,
      });
      showMessage('success', '模板保存成功！');
      // 重新加载模板列表以更新变量信息
      await loadTemplates();
    } catch (error) {
      showMessage('error', `保存失败: ${error}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    if (selectedTemplate) {
      loadTemplate(selectedTemplate);
      showMessage('success', '已恢复原内容');
    }
  };

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

  const currentTemplate = templates.find(t => t.name === selectedTemplate);

  return (
    <div className="flex flex-col h-full p-4 md:p-6 space-y-4 bg-transparent">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold tracking-tight">模板编辑器</h2>
        <div className="flex items-center space-x-2">
          <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
            <SelectTrigger className="w-[250px] bg-card/75 border-border/70">
              <SelectValue placeholder="选择模板" />
            </SelectTrigger>
            <SelectContent>
              {templates.map((template) => (
                <SelectItem key={template.name} value={template.name}>
                  {template.description || template.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {message && (
        <div
          className={`p-3 rounded-xl border text-sm backdrop-blur-sm ${
            message.type === 'success'
              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border-emerald-500/30'
              : 'bg-destructive/10 text-destructive border-destructive/30'
          }`}
        >
          {message.text}
        </div>
      )}

      {currentTemplate && (
        <Card className="p-4 space-y-2 border-border/70 bg-card/70 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold">{currentTemplate.description}</h3>
              <p className="text-sm text-muted-foreground">模板名称: {currentTemplate.name}</p>
            </div>
          </div>
          {currentTemplate.variables.length > 0 && (
            <div className="text-sm">
              <span className="font-medium">可用变量:</span>{' '}
              <span className="text-primary">
                {currentTemplate.variables.map(v => `{{${v}}}`).join(', ')}
              </span>
            </div>
          )}
        </Card>
      )}

      <div className="flex-1 flex flex-col space-y-2">
        <label className="text-sm font-medium">模板内容</label>
        <Textarea
          value={currentContent}
          onChange={(e) => setCurrentContent(e.target.value)}
          className="flex-1 font-mono text-sm"
          placeholder="在此编辑模板内容..."
        />
      </div>

      <div className="flex flex-wrap justify-between items-center gap-3">
        <div className="text-sm text-muted-foreground">
          提示: 使用 {`{{变量名}}`} 格式定义变量
        </div>
        <div className="flex space-x-2">
          <Button variant="outline" onClick={handleReset}>
            恢复原内容
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? '保存中...' : '保存模板'}
          </Button>
        </div>
      </div>
    </div>
  );
}
