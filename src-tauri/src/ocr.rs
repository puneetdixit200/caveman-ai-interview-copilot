use crate::screen_share::NativePrivacyShieldDecision;
use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::Serialize;
use xcap::image::{codecs::png::PngEncoder, ColorType, ImageEncoder, RgbaImage};
use xcap::Monitor;

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ScreenFrame {
    pub image_data_url: String,
    pub width: u32,
    pub height: u32,
    pub monitor_name: Option<String>,
    pub captured_at_ms: i64,
}

pub fn capture_screen_frame() -> anyhow::Result<ScreenFrame> {
    let monitors = Monitor::all()?;
    let monitor = select_primary_monitor(monitors)?;
    let monitor_name = monitor.friendly_name().ok().or_else(|| monitor.name().ok());
    let image = monitor.capture_image()?;
    let width = image.width();
    let height = image.height();

    Ok(ScreenFrame {
        image_data_url: png_data_url_from_rgba_image(&image)?,
        width,
        height,
        monitor_name,
        captured_at_ms: chrono::Utc::now().timestamp_millis(),
    })
}

pub fn native_capture_privacy_gate_message(
    screen_share_decision: NativePrivacyShieldDecision,
    capture_exclusion_decision: NativePrivacyShieldDecision,
) -> Option<String> {
    let mut reasons = Vec::new();

    if let NativePrivacyShieldDecision::Hide { reason } = screen_share_decision {
        reasons.push(reason);
    }

    if let NativePrivacyShieldDecision::Hide { reason } = capture_exclusion_decision {
        reasons.push(reason);
    }

    if reasons.is_empty() {
        return None;
    }

    Some(format!(
        "Native privacy shield denied screen OCR capture. {}",
        reasons.join(" ")
    ))
}

pub fn primary_monitor_index(primary_flags: &[bool]) -> Option<usize> {
    if primary_flags.is_empty() {
        return None;
    }

    primary_flags
        .iter()
        .position(|is_primary| *is_primary)
        .or(Some(0))
}

pub fn png_data_url_from_rgba_image(image: &RgbaImage) -> anyhow::Result<String> {
    let mut png_bytes = Vec::new();
    PngEncoder::new(&mut png_bytes).write_image(
        image.as_raw(),
        image.width(),
        image.height(),
        ColorType::Rgba8.into(),
    )?;

    Ok(format!(
        "data:image/png;base64,{}",
        STANDARD.encode(png_bytes)
    ))
}

fn select_primary_monitor(monitors: Vec<Monitor>) -> anyhow::Result<Monitor> {
    let primary_flags = monitors
        .iter()
        .map(|monitor| monitor.is_primary().unwrap_or(false))
        .collect::<Vec<_>>();
    let index = primary_monitor_index(&primary_flags)
        .ok_or_else(|| anyhow::anyhow!("No desktop monitors are available for OCR capture"))?;

    monitors
        .into_iter()
        .nth(index)
        .ok_or_else(|| anyhow::anyhow!("Could not select desktop monitor for OCR capture"))
}

#[cfg(test)]
mod tests {
    use super::{
        native_capture_privacy_gate_message, png_data_url_from_rgba_image, primary_monitor_index,
    };
    use crate::screen_share::NativePrivacyShieldDecision;
    use xcap::image::{ImageBuffer, Rgba};

    #[test]
    fn selects_primary_monitor_or_first_available_monitor() {
        assert_eq!(primary_monitor_index(&[]), None);
        assert_eq!(primary_monitor_index(&[false, false]), Some(0));
        assert_eq!(primary_monitor_index(&[false, true, false]), Some(1));
    }

    #[test]
    fn encodes_rgba_screenshot_as_png_data_url() {
        let image = ImageBuffer::from_pixel(1, 1, Rgba([255, 255, 255, 255]));
        let data_url = png_data_url_from_rgba_image(&image).expect("encode png");

        assert!(data_url.starts_with("data:image/png;base64,"));
        assert!(data_url.len() > "data:image/png;base64,".len());
    }

    #[test]
    fn native_ocr_capture_gate_blocks_when_share_or_capture_risk_is_active() {
        let blocked_by_share = native_capture_privacy_gate_message(
            NativePrivacyShieldDecision::Hide {
                reason: "Known screen-sharing or recording process is running.".to_string(),
            },
            NativePrivacyShieldDecision::Allow,
        )
        .expect("screen-share risk should block OCR capture");

        assert!(blocked_by_share.contains("Native privacy shield denied screen OCR capture"));
        assert!(blocked_by_share.contains("Known screen-sharing or recording process"));

        let blocked_by_capture = native_capture_privacy_gate_message(
            NativePrivacyShieldDecision::Allow,
            NativePrivacyShieldDecision::Hide {
                reason: "Capture exclusion is not enforced: disabled.".to_string(),
            },
        )
        .expect("capture-exclusion risk should block OCR capture");

        assert!(blocked_by_capture.contains("Native privacy shield denied screen OCR capture"));
        assert!(blocked_by_capture.contains("Capture exclusion is not enforced"));
    }

    #[test]
    fn native_ocr_capture_gate_allows_when_share_clear_and_capture_exclusion_enforced() {
        assert_eq!(
            native_capture_privacy_gate_message(
                NativePrivacyShieldDecision::Allow,
                NativePrivacyShieldDecision::Allow,
            ),
            None
        );
    }
}
