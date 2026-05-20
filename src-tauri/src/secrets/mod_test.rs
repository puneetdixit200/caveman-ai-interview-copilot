use std::collections::HashMap;

use super::{
    delete_provider_api_key_with_store, get_provider_api_key_with_store, provider_secret_account,
    save_provider_api_key_with_store, SecretStore,
};

#[derive(Default)]
struct MemorySecretStore {
    values: std::sync::Mutex<HashMap<String, String>>,
}

impl SecretStore for MemorySecretStore {
    fn set_secret(&self, service: &str, account: &str, secret: &str) -> anyhow::Result<()> {
        self.values
            .lock()
            .unwrap()
            .insert(format!("{service}:{account}"), secret.to_string());
        Ok(())
    }

    fn get_secret(&self, service: &str, account: &str) -> anyhow::Result<Option<String>> {
        Ok(self
            .values
            .lock()
            .unwrap()
            .get(&format!("{service}:{account}"))
            .cloned())
    }

    fn delete_secret(&self, service: &str, account: &str) -> anyhow::Result<()> {
        self.values
            .lock()
            .unwrap()
            .remove(&format!("{service}:{account}"));
        Ok(())
    }
}

#[test]
fn provider_secret_accounts_are_stable_and_scoped() {
    assert_eq!(
        provider_secret_account("openrouter"),
        "provider:openrouter:api-key"
    );
}

#[test]
fn stores_reads_and_deletes_provider_api_keys() {
    let store = MemorySecretStore::default();

    save_provider_api_key_with_store(&store, "openrouter", "sk-test").expect("save key");
    assert_eq!(
        get_provider_api_key_with_store(&store, "openrouter").expect("read key"),
        Some("sk-test".to_string())
    );

    delete_provider_api_key_with_store(&store, "openrouter").expect("delete key");
    assert_eq!(
        get_provider_api_key_with_store(&store, "openrouter").expect("read deleted key"),
        None
    );
}

#[test]
fn rejects_blank_provider_api_keys() {
    let store = MemorySecretStore::default();

    let error =
        save_provider_api_key_with_store(&store, "openrouter", "   ").expect_err("blank key");

    assert!(error.to_string().contains("empty"));
}
