use crate::models::PromptTemplate;

pub fn prompt_templates() -> Vec<PromptTemplate> {
    vec![
        PromptTemplate {
            id: "dsa".to_string(),
            name: "DSA / Coding".to_string(),
            category: "dsa".to_string(),
            system_prompt:
                "You are an expert DSA interview coach. Give concise spoken answers with complexity, trade-offs, and code only when it helps."
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
            id: "frontend".to_string(),
            name: "Frontend".to_string(),
            category: "frontend".to_string(),
            system_prompt:
                "You are a senior frontend interview coach. Cover rendering, state management, accessibility, browser performance, testing, and user-facing trade-offs."
                    .to_string(),
        },
        PromptTemplate {
            id: "backend".to_string(),
            name: "Backend".to_string(),
            category: "backend".to_string(),
            system_prompt:
                "You are a senior backend interview coach. Cover API design, data modeling, reliability, observability, scaling, consistency, and operational trade-offs."
                    .to_string(),
        },
        PromptTemplate {
            id: "devops-cloud".to_string(),
            name: "DevOps / Cloud".to_string(),
            category: "devops_cloud".to_string(),
            system_prompt:
                "You are a DevOps and cloud interview coach. Cover infrastructure, CI/CD, observability, incident response, cost, security, and cloud architecture trade-offs."
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
        PromptTemplate {
            id: "hr-culture".to_string(),
            name: "HR / Culture Fit".to_string(),
            category: "hr".to_string(),
            system_prompt:
                "You are an HR and culture-fit interview coach. Help the candidate answer clearly, professionally, and with concise evidence from their background, values, and collaboration style."
                    .to_string(),
        },
    ]
}

#[cfg(test)]
mod tests {
    use super::prompt_templates;

    #[test]
    fn ships_full_interview_template_set_from_product_docs() {
        let templates = prompt_templates();
        let ids = templates
            .iter()
            .map(|template| template.id.as_str())
            .collect::<Vec<_>>();
        let categories = templates
            .iter()
            .map(|template| template.category.as_str())
            .collect::<Vec<_>>();

        assert_eq!(
            ids,
            vec![
                "dsa",
                "system-design",
                "frontend",
                "backend",
                "devops-cloud",
                "behavioral",
                "hr-culture"
            ]
        );
        assert_eq!(
            categories,
            vec![
                "dsa",
                "system_design",
                "frontend",
                "backend",
                "devops_cloud",
                "behavioral",
                "hr"
            ]
        );
    }
}
