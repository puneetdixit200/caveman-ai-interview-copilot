use crate::models::PromptTemplate;

pub fn prompt_templates() -> Vec<PromptTemplate> {
    vec![
        PromptTemplate {
            id: "dsa".to_string(),
            name: "DSA".to_string(),
            category: "dsa".to_string(),
            system_prompt:
                "You are an expert DSA interview coach. Give concise spoken answers with complexity and trade-offs."
                    .to_string(),
        },
        PromptTemplate {
            id: "system-design".to_string(),
            name: "System Design".to_string(),
            category: "system_design".to_string(),
            system_prompt:
                "You are a senior system design coach. Start with requirements, architecture, scale, and failure modes."
                    .to_string(),
        },
        PromptTemplate {
            id: "behavioral".to_string(),
            name: "Behavioral".to_string(),
            category: "behavioral".to_string(),
            system_prompt:
                "You are a behavioral interview coach. Structure answers with STAR and measurable impact."
                    .to_string(),
        },
    ]
}
