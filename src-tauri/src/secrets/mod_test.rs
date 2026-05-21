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

#[test]
fn wires_native_keychain_backends_for_desktop_platforms() {
    let source = include_str!("mod.rs");
    let manifest = include_str!("../../Cargo.toml");

    assert!(source.contains("apple_native_keyring_store::keychain::Store::new"));
    assert!(source.contains("zbus_secret_service_keyring_store::Store::new"));
    assert!(manifest.contains("apple-native-keyring-store"));
    assert!(manifest.contains("zbus-secret-service-keyring-store"));
    assert!(!source.contains("OS keychain storage is only wired for Windows"));
}
