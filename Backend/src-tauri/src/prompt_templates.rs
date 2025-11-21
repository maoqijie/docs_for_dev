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
            // 创建默认的文档驱动开发模板
            self.create_default_doc_driven_template()?;
        }

        for entry in fs::read_dir(&self.templates_dir)? {
            let entry = entry?;
            let path = entry.path();

            if path.extension().and_then(|s| s.to_str()) == Some("txt") {
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
                    description: format!("{} 提示词模板", name),
                };

                self.templates.insert(name, template);
            }
        }

        Ok(())
    }

    /// 创建默认的文档驱动开发模板
    fn create_default_doc_driven_template(&self) -> anyhow::Result<()> {
        let template_path = self.templates_dir.join("doc-driven-dev.template.txt");
        let default_content = include_str!("../prompts/doc-driven-dev.template.txt");
        fs::write(template_path, default_content)?;
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
        let template_path = self.templates_dir.join(format!("{}.template.txt", name));
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
                .unwrap_or_else(|| format!("{} 提示词模板", name)),
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
        let template_path = self.templates_dir.join(format!("{}.template.txt", name));

        if template_path.exists() {
            return Err(anyhow::anyhow!("模板已存在: {}", name));
        }

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
        let template_path = self.templates_dir.join(format!("{}.template.txt", name));

        if !template_path.exists() {
            return Err(anyhow::anyhow!("模板不存在: {}", name));
        }

        fs::remove_file(&template_path)?;
        self.templates.remove(name);
        Ok(())
    }

    /// 获取模板文件路径（用于用户手动编辑）
    pub fn get_template_path(&self, name: &str) -> PathBuf {
        self.templates_dir.join(format!("{}.template.txt", name))
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
