use std::sync::Mutex;
use std::time::Instant;

use serde::Serialize;

const STARTUP_TARGET_MS: u64 = 3_000;
const MEMORY_TARGET_MB: u64 = 500;
const IDLE_CPU_TARGET_PERCENT: f64 = 15.0;
const ACTIVE_CPU_TARGET_PERCENT: f64 = 40.0;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeBudgetStatus {
    pub startup_ms: u64,
    pub working_set_mb: Option<f64>,
    pub process_cpu_percent: Option<f64>,
    pub startup_target_ms: u64,
    pub memory_target_mb: u64,
    pub idle_cpu_target_percent: f64,
    pub active_cpu_target_percent: f64,
    pub sample_count: u64,
    pub source: String,
    pub message: Option<String>,
}

#[derive(Debug, Clone)]
struct CpuSample {
    captured_at: Instant,
    process_time_100ns: u64,
    sample_count: u64,
}

#[derive(Debug)]
pub struct RuntimeBudget {
    started_at: Instant,
    cpu_sample: Mutex<Option<CpuSample>>,
}

impl RuntimeBudget {
    pub fn new() -> Self {
        Self {
            started_at: Instant::now(),
            cpu_sample: Mutex::new(capture_cpu_sample()),
        }
    }

    pub fn status(&self) -> RuntimeBudgetStatus {
        let (process_cpu_percent, sample_count) = self.process_cpu_percent();
        let working_set_mb = process_working_set_mb();
        let mut message = None;

        if working_set_mb.is_none() || process_cpu_percent.is_none() {
            message = Some(
                "Refresh once after startup for a stable CPU sample; memory/CPU metrics depend on platform support."
                    .to_string(),
            );
        }

        RuntimeBudgetStatus {
            startup_ms: self
                .started_at
                .elapsed()
                .as_millis()
                .min(u128::from(u64::MAX)) as u64,
            working_set_mb,
            process_cpu_percent,
            startup_target_ms: STARTUP_TARGET_MS,
            memory_target_mb: MEMORY_TARGET_MB,
            idle_cpu_target_percent: IDLE_CPU_TARGET_PERCENT,
            active_cpu_target_percent: ACTIVE_CPU_TARGET_PERCENT,
            sample_count,
            source: runtime_metric_source().to_string(),
            message,
        }
    }

    fn process_cpu_percent(&self) -> (Option<f64>, u64) {
        let Some(mut next_sample) = capture_cpu_sample() else {
            return (None, 0);
        };

        let mut previous_sample = self
            .cpu_sample
            .lock()
            .expect("runtime budget mutex poisoned");
        let Some(previous) = previous_sample.replace(next_sample.clone()) else {
            return (None, next_sample.sample_count);
        };
        next_sample.sample_count = previous.sample_count + 1;
        *previous_sample = Some(next_sample.clone());

        let elapsed_seconds = next_sample
            .captured_at
            .duration_since(previous.captured_at)
            .as_secs_f64();
        if elapsed_seconds <= 0.0 {
            return (None, next_sample.sample_count);
        }

        let process_delta_100ns = next_sample
            .process_time_100ns
            .saturating_sub(previous.process_time_100ns);
        let process_seconds = process_delta_100ns as f64 / 10_000_000.0;
        let core_count = std::thread::available_parallelism()
            .map(|value| value.get())
            .unwrap_or(1) as f64;
        let percent = (process_seconds / elapsed_seconds / core_count * 100.0).clamp(0.0, 100.0);

        (Some(round_one_decimal(percent)), next_sample.sample_count)
    }
}

impl Default for RuntimeBudget {
    fn default() -> Self {
        Self::new()
    }
}

fn round_one_decimal(value: f64) -> f64 {
    (value * 10.0).round() / 10.0
}

#[cfg(target_os = "windows")]
fn process_working_set_mb() -> Option<f64> {
    use std::mem::size_of;

    use windows::Win32::System::ProcessStatus::{GetProcessMemoryInfo, PROCESS_MEMORY_COUNTERS};
    use windows::Win32::System::Threading::GetCurrentProcess;

    let mut counters = PROCESS_MEMORY_COUNTERS {
        cb: size_of::<PROCESS_MEMORY_COUNTERS>() as u32,
        ..Default::default()
    };
    let ok = unsafe {
        GetProcessMemoryInfo(
            GetCurrentProcess(),
            &mut counters,
            size_of::<PROCESS_MEMORY_COUNTERS>() as u32,
        )
    }
    .is_ok();

    if ok {
        Some(round_one_decimal(
            counters.WorkingSetSize as f64 / 1024.0 / 1024.0,
        ))
    } else {
        None
    }
}

#[cfg(not(target_os = "windows"))]
fn process_working_set_mb() -> Option<f64> {
    None
}

#[cfg(target_os = "windows")]
fn capture_cpu_sample() -> Option<CpuSample> {
    use windows::Win32::Foundation::FILETIME;
    use windows::Win32::System::Threading::{GetCurrentProcess, GetProcessTimes};

    let mut creation = FILETIME::default();
    let mut exit = FILETIME::default();
    let mut kernel = FILETIME::default();
    let mut user = FILETIME::default();

    let ok = unsafe {
        GetProcessTimes(
            GetCurrentProcess(),
            &mut creation,
            &mut exit,
            &mut kernel,
            &mut user,
        )
    }
    .is_ok();
    if !ok {
        return None;
    }

    Some(CpuSample {
        captured_at: Instant::now(),
        process_time_100ns: filetime_to_u64(kernel) + filetime_to_u64(user),
        sample_count: 1,
    })
}

#[cfg(not(target_os = "windows"))]
fn capture_cpu_sample() -> Option<CpuSample> {
    None
}

#[cfg(target_os = "windows")]
fn filetime_to_u64(value: windows::Win32::Foundation::FILETIME) -> u64 {
    (u64::from(value.dwHighDateTime) << 32) | u64::from(value.dwLowDateTime)
}

fn runtime_metric_source() -> &'static str {
    if cfg!(target_os = "windows") {
        "windows-process"
    } else {
        "portable"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn runtime_status_reports_documented_budget_targets() {
        let budget = RuntimeBudget::new();
        let status = budget.status();

        assert_eq!(status.startup_target_ms, 3_000);
        assert_eq!(status.memory_target_mb, 500);
        assert_eq!(status.idle_cpu_target_percent, 15.0);
        assert_eq!(status.active_cpu_target_percent, 40.0);
    }

    #[test]
    fn runtime_status_startup_time_moves_forward() {
        let budget = RuntimeBudget::new();
        std::thread::sleep(std::time::Duration::from_millis(2));

        assert!(budget.status().startup_ms > 0);
    }
}
