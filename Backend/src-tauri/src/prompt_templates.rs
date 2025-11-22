use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PromptTemplate {
    pub name: String,
    pub content: String,
    pub variables: Vec<String>,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PromptTemplateManager {
    templates: HashMap<String, PromptTemplate>,
    templates_dir: PathBuf,
}

impl PromptTemplateManager {
    /// 创建新的模板管理器
    pub fn new(templates_dir: PathBuf) -> anyhow::Result<Self> {
        let mut manager = Self {
            templates: HashMap::new(),
            templates_dir,
        };
        manager.load_templates()?;
        Ok(manager)
    }

    /// 从目录加载所有模板
    fn load_templates(&mut self) -> anyhow::Result<()> {
        if !self.templates_dir.exists() {
            fs::create_dir_all(&self.templates_dir)?;
        }
        self.ensure_default_templates()?;

        let mut ext_priority: HashMap<String, u8> = HashMap::new();

        for entry in fs::read_dir(&self.templates_dir)? {
            let entry = entry?;
            let path = entry.path();

            let ext = path.extension().and_then(|s| s.to_str());
            let priority = match ext.and_then(extension_priority) {
                Some(p) => p,
                None => continue,
            };

            let name = path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("unknown")
                .replace(".template", "");

            let content = fs::read_to_string(&path)?;
            let variables = extract_variables(&content);
            let template = PromptTemplate {
                name: name.clone(),
                content,
                variables,
                description: default_description(&name),
            };

            // 同名模板优先保留更高优先级（md > txt）
            let should_replace = match ext_priority.get(&name) {
                Some(prev) => priority >= *prev,
                None => true,
            };

            if should_replace {
                ext_priority.insert(name.clone(), priority);
                self.templates.insert(name, template);
            }
        }

        Ok(())
    }

    /// 写入默认模板（缺失时补充，不覆盖用户修改）
    fn ensure_default_templates(&self) -> anyhow::Result<()> {
        let defaults = vec![
            ("check.md", include_str!("../prompts/check.md")),
            ("do.md", include_str!("../prompts/do.md")),
        ];

        for (filename, content) in defaults {
            let path = self.templates_dir.join(filename);
            if !path.exists() {
                fs::write(path, content)?;
            }
        }

        Ok(())
    }

    /// 渲染模板（替换变量）
    pub fn render(
        &self,
        template_name: &str,
        variables: &HashMap<String, String>,
    ) -> anyhow::Result<String> {
        let template = self
            .templates
            .get(template_name)
            .ok_or_else(|| anyhow::anyhow!("模板不存在: {}", template_name))?;

        let mut result = template.content.clone();

        for (key, value) in variables {
            let placeholder = format!("{{{{{}}}}}", key);
            result = result.replace(&placeholder, value);
        }

        Ok(result)
    }

    /// 获取所有模板列表
    pub fn list_templates(&self) -> Vec<PromptTemplate> {
        self.templates.values().cloned().collect()
    }

    /// 获取特定模板
    pub fn get_template(&self, name: &str) -> Option<&PromptTemplate> {
        self.templates.get(name)
    }

    /// 更新模板内容
    pub fn update_template(&mut self, name: &str, content: String) -> anyhow::Result<()> {
        let template_path = self.resolve_template_path(name);
        fs::write(&template_path, &content)?;

        // 重新加载模板
        let variables = extract_variables(&content);

        let template = PromptTemplate {
            name: name.to_string(),
            content,
            variables,
            description: self
                .templates
                .get(name)
                .map(|t| t.description.clone())
                .unwrap_or_else(|| default_description(name)),
        };

        self.templates.insert(name.to_string(), template);
        Ok(())
    }

    /// 创建新模板
    pub fn create_template(
        &mut self,
        name: &str,
        content: String,
        description: String,
    ) -> anyhow::Result<()> {
        if self.template_exists(name) {
            return Err(anyhow::anyhow!("模板已存在: {}", name));
        }

        let template_path = self.templates_dir.join(format!("{}.md", name));
        fs::write(&template_path, &content)?;

        let variables = extract_variables(&content);
        let template = PromptTemplate {
            name: name.to_string(),
            content,
            variables,
            description,
        };

        self.templates.insert(name.to_string(), template);
        Ok(())
    }

    /// 删除模板
    pub fn delete_template(&mut self, name: &str) -> anyhow::Result<()> {
        let template_path = self.resolve_template_path(name);

        if !template_path.exists() {
            return Err(anyhow::anyhow!("模板不存在: {}", name));
        }

        fs::remove_file(&template_path)?;
        self.templates.remove(name);
        Ok(())
    }

    /// 获取模板文件路径（用于用户手动编辑）
    pub fn get_template_path(&self, name: &str) -> PathBuf {
        self.resolve_template_path(name)
    }
}

/// 从模板内容中提取变量名
fn extract_variables(content: &str) -> Vec<String> {
    let mut variables = Vec::new();
    let mut chars = content.chars().peekable();

    while let Some(c) = chars.next() {
        if c == '{' {
            if let Some(&next_c) = chars.peek() {
                if next_c == '{' {
                    chars.next(); // 消费第二个 '{'

                    let mut var_name = String::new();
                    let mut found_closing = false;

                    while let Some(c) = chars.next() {
                        if c == '}' {
                            if let Some(&next_c) = chars.peek() {
                                if next_c == '}' {
                                    chars.next(); // 消费第二个 '}'
                                    found_closing = true;
                                    break;
                                }
                            }
                        }
                        var_name.push(c);
                    }

                    if found_closing && !var_name.is_empty() {
                        if !variables.contains(&var_name) {
                            variables.push(var_name);
                        }
                    }
                }
            }
        }
    }

    variables
}

/// 根据扩展名定义加载优先级（md > txt）
fn extension_priority(ext: &str) -> Option<u8> {
    match ext {
        "md" => Some(2),
        "txt" => Some(1),
        _ => None,
    }
}

/// 为常见模板名设置默认描述
fn default_description(name: &str) -> String {
    match name {
        "check" => "文档驱动-检查阶段提示词".to_string(),
        "do" => "文档驱动-落地阶段提示词".to_string(),
        _ => format!("{} 提示词模板", name),
    }
}

/// 生成常用候选路径，优先 md
fn candidate_template_paths(base: &PathBuf, name: &str) -> Vec<PathBuf> {
    vec![
        base.join(format!("{}.md", name)),
        base.join(format!("{}.template.md", name)),
        base.join(format!("{}.txt", name)),
        base.join(format!("{}.template.txt", name)),
    ]
}

impl PromptTemplateManager {
    fn resolve_template_path(&self, name: &str) -> PathBuf {
        for path in candidate_template_paths(&self.templates_dir, name) {
            if path.exists() {
                return path;
            }
        }
        self.templates_dir.join(format!("{}.md", name))
    }

    fn template_exists(&self, name: &str) -> bool {
        candidate_template_paths(&self.templates_dir, name)
            .into_iter()
            .any(|p| p.exists())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_variables() {
        let template = "工作目录: {{WORKING_DIR}}\n文档: {{DOC_PATH}}";
        let vars = extract_variables(template);
        assert_eq!(vars, vec!["WORKING_DIR", "DOC_PATH"]);
    }

    #[test]
    fn test_render_template() {
        let template = PromptTemplate {
            name: "test".to_string(),
            content: "Dir: {{DIR}}, File: {{FILE}}".to_string(),
            variables: vec!["DIR".to_string(), "FILE".to_string()],
            description: "Test".to_string(),
        };

        let mut variables = HashMap::new();
        variables.insert("DIR".to_string(), "/home/user".to_string());
        variables.insert("FILE".to_string(), "test.txt".to_string());

        let mut manager = PromptTemplateManager {
            templates: HashMap::new(),
            templates_dir: PathBuf::from("/tmp"),
        };
        manager.templates.insert("test".to_string(), template);

        let result = manager.render("test", &variables).unwrap();
        assert_eq!(result, "Dir: /home/user, File: test.txt");
    }
}
