use std::sync::OnceLock;

use anyhow::{bail, Context};
use keyring_core::{Entry, Error as KeyringError};
use serde::Serialize;

const SERVICE_NAME: &str = "com.caveman.desktop";

pub trait SecretStore {
    fn set_secret(&self, service: &str, account: &str, secret: &str) -> anyhow::Result<()>;
    fn get_secret(&self, service: &str, account: &str) -> anyhow::Result<Option<String>>;
    fn delete_secret(&self, service: &str, account: &str) -> anyhow::Result<()>;
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SecretStatus {
    pub provider_id: String,
    pub stored: bool,
}

pub struct KeyringSecretStore;

impl SecretStore for KeyringSecretStore {
    fn set_secret(&self, service: &str, account: &str, secret: &str) -> anyhow::Result<()> {
        ensure_native_store()?;
        Entry::new(service, account)
            .context("create keychain entry")?
            .set_password(secret)
            .context("write keychain secret")
    }

    fn get_secret(&self, service: &str, account: &str) -> anyhow::Result<Option<String>> {
        ensure_native_store()?;
        match Entry::new(service, account)
            .context("create keychain entry")?
            .get_password()
        {
            Ok(secret) => Ok(Some(secret)),
            Err(KeyringError::NoEntry) => Ok(None),
            Err(error) => Err(error).context("read keychain secret"),
        }
    }

    fn delete_secret(&self, service: &str, account: &str) -> anyhow::Result<()> {
        ensure_native_store()?;
        match Entry::new(service, account)
            .context("create keychain entry")?
            .delete_credential()
        {
            Ok(()) | Err(KeyringError::NoEntry) => Ok(()),
            Err(error) => Err(error).context("delete keychain secret"),
        }
    }
}

pub fn provider_secret_account(provider_id: &str) -> String {
    format!("provider:{}:api-key", provider_id.trim().to_lowercase())
}

pub fn save_provider_api_key_with_store(
    store: &impl SecretStore,
    provider_id: &str,
    secret: &str,
) -> anyhow::Result<SecretStatus> {
    validate_provider_id(provider_id)?;
    let trimmed = secret.trim();
    if trimmed.is_empty() {
        bail!("provider API key cannot be empty");
    }

    store.set_secret(SERVICE_NAME, &provider_secret_account(provider_id), trimmed)?;
    Ok(SecretStatus {
        provider_id: provider_id.to_string(),
        stored: true,
    })
}

pub fn get_provider_api_key_with_store(
    store: &impl SecretStore,
    provider_id: &str,
) -> anyhow::Result<Option<String>> {
    validate_provider_id(provider_id)?;
    store.get_secret(SERVICE_NAME, &provider_secret_account(provider_id))
}

pub fn delete_provider_api_key_with_store(
    store: &impl SecretStore,
    provider_id: &str,
) -> anyhow::Result<SecretStatus> {
    validate_provider_id(provider_id)?;
    store.delete_secret(SERVICE_NAME, &provider_secret_account(provider_id))?;
    Ok(SecretStatus {
        provider_id: provider_id.to_string(),
        stored: false,
    })
}

pub fn save_provider_api_key(provider_id: &str, secret: &str) -> anyhow::Result<SecretStatus> {
    save_provider_api_key_with_store(&KeyringSecretStore, provider_id, secret)
}

pub fn get_provider_api_key(provider_id: &str) -> anyhow::Result<Option<String>> {
    get_provider_api_key_with_store(&KeyringSecretStore, provider_id)
}

pub fn delete_provider_api_key(provider_id: &str) -> anyhow::Result<SecretStatus> {
    delete_provider_api_key_with_store(&KeyringSecretStore, provider_id)
}

fn validate_provider_id(provider_id: &str) -> anyhow::Result<()> {
    let id = provider_id.trim();
    if id.is_empty() {
        bail!("provider id cannot be empty");
    }
    if !id
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || ch == '-' || ch == '_')
    {
        bail!("provider id contains unsupported characters");
    }
    Ok(())
}

fn ensure_native_store() -> anyhow::Result<()> {
    static KEYRING_INIT: OnceLock<Result<(), String>> = OnceLock::new();
    match KEYRING_INIT.get_or_init(initialize_native_store) {
        Ok(()) => Ok(()),
        Err(message) => bail!("initialize native keychain store: {message}"),
    }
}

#[cfg(target_os = "windows")]
fn initialize_native_store() -> Result<(), String> {
    let store = windows_native_keyring_store::Store::new().map_err(|error| error.to_string())?;
    keyring_core::set_default_store(store);
    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn initialize_native_store() -> Result<(), String> {
    Err("OS keychain storage is only wired for Windows in this build".to_string())
}

#[cfg(test)]
mod mod_test;
