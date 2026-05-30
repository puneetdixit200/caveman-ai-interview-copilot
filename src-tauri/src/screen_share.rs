use serde::Serialize;
#[cfg(target_os = "macos")]
use std::ffi::c_void;
use std::{
    io::Read,
    process::{Command, Output, Stdio},
    sync::atomic::{AtomicBool, Ordering},
    thread,
    time::{Duration, Instant},
};

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ScreenShareProcess {
    pub name: String,
    pub pid: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub window_title: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ScreenShareStatus {
    pub active: bool,
    pub matched_processes: Vec<ScreenShareProcess>,
    pub message: Option<String>,
}

const NATIVE_PRIVACY_SHIELD_INTERVAL: Duration = Duration::from_millis(50);
const SCREEN_SHARE_GUARD_COMMAND_TIMEOUT: Duration = Duration::from_millis(1_500);
#[cfg(target_os = "macos")]
const MACOS_WINDOW_TITLE_GUARD_COMMAND_TIMEOUT: Duration = Duration::from_millis(750);
#[cfg(target_os = "macos")]
const MACOS_WINDOW_TITLE_PRIVACY_SCAN_INTERVAL: Duration = Duration::from_millis(5_000);
#[cfg(target_os = "macos")]
const MACOS_CORE_GRAPHICS_TITLE_PRIVACY_SCAN_INTERVAL: Duration = Duration::from_millis(250);
static NATIVE_PRIVACY_SHIELD_SHARE_RISK_ACTIVE: AtomicBool = AtomicBool::new(false);
#[cfg(target_os = "macos")]
static MACOS_WINDOW_TITLE_PRIVACY_RISK_ACTIVE: AtomicBool = AtomicBool::new(false);
#[cfg(target_os = "macos")]
static MACOS_CORE_GRAPHICS_TITLE_PRIVACY_RISK_ACTIVE: AtomicBool = AtomicBool::new(false);
pub const NATIVE_PRIVACY_SHIELD_THREAD_START_FAILED_MARKER: &str =
    "Native privacy shield thread failed to start; refusing to run without fail-closed screen-share guard.";
pub const NATIVE_PRIVACY_SHIELD_STARTS_BEFORE_INITIAL_SHOW_MARKER: &str =
    "Native privacy shield starts before startup companion window show.";
pub const NATIVE_PRIVACY_SHIELD_FAST_POLL_MARKER: &str =
    "Native privacy shield polls every 50ms for new screen-share risk.";
pub const NATIVE_PRIVACY_SHIELD_SKIPS_WINDOW_TITLE_SCAN_MARKER: &str =
    "Native privacy shield keeps macOS window-title scans out of the fast poll so direct capture polling cannot stall.";
pub const NATIVE_PRIVACY_SHIELD_MACOS_PGREP_CAPTURE_MARKER: &str =
    "Native privacy shield checks macOS capture processes with pgrep before slower process parsing.";
#[cfg(target_os = "macos")]
pub const NATIVE_PRIVACY_SHIELD_MACOS_PGREP_FAIL_CLOSED_MARKER: &str =
    "Native privacy shield treats unexpected macOS pgrep errors as fail-closed before slower process parsing.";
#[cfg(target_os = "macos")]
pub const NATIVE_PRIVACY_SHIELD_MACOS_LIBPROC_CAPTURE_MARKER: &str =
    "Native privacy shield enumerates macOS capture processes through libproc before shell fallbacks.";
#[cfg(target_os = "macos")]
pub const NATIVE_PRIVACY_SHIELD_MACOS_WINDOW_TITLE_BACKGROUND_SCAN_MARKER: &str =
    "Native privacy shield scans macOS window titles on a bounded background worker for browser Meet and Teams risk.";
#[cfg(target_os = "macos")]
pub const NATIVE_PRIVACY_SHIELD_MACOS_CORE_GRAPHICS_TITLE_GATE_MARKER: &str =
    "Native privacy shield checks macOS CoreGraphics visible window titles before app windows can show.";
#[cfg(target_os = "macos")]
pub const NATIVE_PRIVACY_SHIELD_MACOS_CORE_GRAPHICS_TITLE_FAST_SCAN_MARKER: &str =
    "Native privacy shield scans macOS CoreGraphics visible window titles every 250ms for browser Meet and Teams risk.";
#[cfg(target_os = "macos")]
pub const NATIVE_PRIVACY_SHIELD_MACOS_REDACTED_BROWSER_TITLE_MARKER: &str =
    "macOS CoreGraphics title guard hides when a visible browser window title is unavailable.";
#[cfg(target_os = "windows")]
pub const NATIVE_PRIVACY_SHIELD_WINDOWS_ENUMWINDOWS_TITLE_MARKER: &str =
    "Native privacy shield enumerates Windows visible window titles with EnumWindows for browser Meet and Teams risk.";
#[cfg(target_os = "windows")]
pub const NATIVE_PRIVACY_SHIELD_WINDOWS_ENUMWINDOWS_FAST_GATE_MARKER: &str =
    "Native privacy shield checks Windows EnumWindows visible titles before tasklist fallback.";
#[cfg(target_os = "windows")]
pub const NATIVE_PRIVACY_SHIELD_WINDOWS_UNAVAILABLE_BROWSER_TITLE_MARKER: &str =
    "Windows visible browser title guard hides when a visible browser window title is unavailable.";
#[cfg(target_os = "windows")]
pub const NATIVE_PRIVACY_SHIELD_WINDOWS_TOOLHELP_PROCESS_MARKER: &str =
    "Native privacy shield enumerates Windows processes with ToolHelp before tasklist fallback.";
pub const NATIVE_PRIVACY_SHIELD_REFRESHES_CAPTURE_BEFORE_SHARE_HIDE_MARKER: &str =
    "Native privacy shield refreshes capture exclusion before hiding for screen-share risk.";
pub const NATIVE_PRIVACY_SHIELD_MAIN_THREAD_WINDOW_UPDATE_MARKER: &str =
    "Native privacy shield applies app-window updates on the Tauri main thread.";
pub const NATIVE_PRIVACY_SHIELD_SHARE_RISK_LATCH_MARKER: &str =
    "Native privacy shield exposes a nonblocking share-risk latch for bounds repair.";
pub const SCREEN_SHARE_GUARD_COMMAND_TIMEOUT_MARKER: &str =
    "Screen-share guard command timeout failed closed before privacy polling could stall.";
const EDGE_WEBVIEW_HOST_PROCESS: &str = "msedgewebview2.exe";
const EDGE_PWA_HOST_PROCESS: &str = "msedge_proxy.exe";
const APPLICATION_FRAME_HOST_PROCESS: &str = "applicationframehost.exe";
const CHROME_PWA_HOST_PROCESS: &str = "chrome_proxy.exe";
const BRAVE_PWA_HOST_PROCESS: &str = "brave_proxy.exe";
const OPERA_PWA_HOST_PROCESS: &str = "opera_proxy.exe";
const VIVALDI_PWA_HOST_PROCESS: &str = "vivaldi_proxy.exe";
const ZEN_BROWSER_PROCESS: &str = "zen";
const ZEN_BROWSER_EXE_PROCESS: &str = "zen.exe";
const CHROMIUM_BROWSER_PROCESS: &str = "chromium";
const CHROMIUM_BROWSER_EXE_PROCESS: &str = "chromium.exe";
const LIBREWOLF_BROWSER_PROCESS: &str = "librewolf";
const LIBREWOLF_BROWSER_EXE_PROCESS: &str = "librewolf.exe";
const WATERFOX_BROWSER_PROCESS: &str = "waterfox";
const WATERFOX_BROWSER_EXE_PROCESS: &str = "waterfox.exe";
const FLOORP_BROWSER_PROCESS: &str = "floorp";
const FLOORP_BROWSER_EXE_PROCESS: &str = "floorp.exe";
const DUCKDUCKGO_BROWSER_PROCESS: &str = "duckduckgo";
const DUCKDUCKGO_BROWSER_EXE_PROCESS: &str = "duckduckgo.exe";
const MULLVAD_BROWSER_PROCESS: &str = "mullvad browser";
const MULLVAD_BROWSER_DASH_PROCESS: &str = "mullvad-browser";
const WEBEX_HOST_PROCESS: &str = "webexhost.exe";
const SCREENCONNECT_WINDOWS_CLIENT_PROCESS: &str = "screenconnect.windowsclient.exe";
const SCREENCONNECT_CLIENT_PROCESS: &str = "screenconnect.client.exe";
const ZOHO_ASSIST_PROCESS: &str = "zohoassist.exe";
const ZOHO_ASSIST_CONNECT_PROCESS: &str = "za_connect.exe";
const TEAMS_WEB_MEETING_ORIGIN: &str = "teams.microsoft.com";
const TEAMS_CONSUMER_WEB_MEETING_ORIGIN: &str = "teams.live.com";
const TEAMS_CLOUD_WEB_MEETING_ORIGIN: &str = "teams.cloud.microsoft";
const MEET_WEB_MEETING_ORIGIN: &str = "meet.google.com";
const GOOGLE_MEET_CALL_ORIGIN: &str = "call.google.com";
const GOOGLE_MEET_SHORT_TITLE_PREFIX: &str = "meet - ";
const ZOOM_WEB_MEETING_ORIGIN: &str = "zoom.us";
const SKYPE_WEB_MEETING_ORIGIN: &str = "join.skype.com";
const SLACK_WEB_HUDDLE_ORIGIN: &str = "app.slack.com";
const DISCORD_WEB_HUDDLE_ORIGIN: &str = "discord.com";
const WHATSAPP_WEB_CALL_ORIGIN: &str = "web.whatsapp.com";
const WEBEX_WEB_MEETING_ORIGIN: &str = "webex.com";
const GOTO_WEB_MEETING_ORIGIN: &str = "meet.goto.com";
const JITSI_WEB_MEETING_ORIGIN: &str = "meet.jit.si";
const AMAZON_CHIME_WEB_MEETING_ORIGIN: &str = "app.chime.aws";
const WHEREBY_WEB_MEETING_ORIGIN: &str = "whereby.com";
const DAILY_WEB_MEETING_ORIGIN: &str = "daily.co";
const GATHER_WEB_MEETING_ORIGIN: &str = "gather.town";
const TALKY_WEB_MEETING_ORIGIN: &str = "talky.io";
const DEMIO_WEB_MEETING_ORIGIN: &str = "demio.com";
const REMO_WEB_MEETING_ORIGIN: &str = "remo.co";
const RIVERSIDE_WEB_MEETING_ORIGIN: &str = "riverside.fm";
const STREAMYARD_WEB_MEETING_ORIGIN: &str = "streamyard.com";
const LIVESTORM_WEB_MEETING_ORIGIN: &str = "livestorm.co";
const BIGBLUEBUTTON_MEETING_TITLE: &str = "bigbluebutton";
const TELLA_WEB_RECORDER_ORIGIN: &str = "tella.tv";
const SCREENPAL_WEB_RECORDER_ORIGIN: &str = "screenpal.com";
const VEED_WEB_RECORDER_ORIGIN: &str = "veed.io";
const CLIPCHAMP_WEB_RECORDER_ORIGIN: &str = "clipchamp.com";
const VIDYARD_WEB_RECORDER_ORIGIN: &str = "vidyard.com";
const DESCRIPT_WEB_RECORDER_ORIGIN: &str = "descript.com";
const RESTREAM_WEB_STUDIO_ORIGIN: &str = "studio.restream.io";
const VDO_NINJA_WEB_CALL_ORIGIN: &str = "vdo.ninja";
const PANOPTO_WEB_CAPTURE_ORIGIN: &str = "panopto.com";
const KALTURA_WEB_CAPTURE_ORIGIN: &str = "kaltura.com";
const SCREENITY_WEB_CAPTURE_TITLE: &str = "screenity";
const BROWSER_YOU_ARE_SHARING_TITLE: &str = "you are sharing";
const BROWSER_YOURE_SHARING_TITLE: &str = "you're sharing";
const BROWSER_SHARING_YOUR_SCREEN_TITLE: &str = "sharing your screen";
const BROWSER_SHARING_YOUR_ENTIRE_SCREEN_TITLE: &str = "sharing your entire screen";
const BROWSER_SHARING_ENTIRE_SCREEN_TITLE: &str = "sharing entire screen";
const BROWSER_SHARING_THIS_TAB_TITLE: &str = "sharing this tab";
const BROWSER_SHARING_A_BROWSER_TAB_TITLE: &str = "sharing a browser tab";
const BROWSER_SHARING_A_CHROME_TAB_TITLE: &str = "sharing a chrome tab";
const BROWSER_SHARING_A_WINDOW_TITLE: &str = "sharing a window";
const BROWSER_SHARING_AN_APPLICATION_WINDOW_TITLE: &str = "sharing an application window";
const BROWSER_THIS_TAB_IS_BEING_SHARED_TITLE: &str = "this tab is being shared";
const BROWSER_THIS_WINDOW_IS_BEING_SHARED_TITLE: &str = "this window is being shared";
const BROWSER_APPLICATION_WINDOW_IS_BEING_SHARED_TITLE: &str = "application window is being shared";
const BROWSER_THIS_SCREEN_IS_BEING_SHARED_TITLE: &str = "this screen is being shared";
const BROWSER_SCREEN_IS_BEING_SHARED_TITLE: &str = "screen is being shared";
const BROWSER_STOP_SHARING_TITLE: &str = "stop sharing";
const BROWSER_YOU_ARE_PRESENTING_TITLE: &str = "you are presenting";
const BROWSER_YOURE_PRESENTING_TITLE: &str = "you're presenting";
const BROWSER_PRESENTING_YOUR_SCREEN_TITLE: &str = "presenting your screen";
const BROWSER_PRESENTING_THIS_TAB_TITLE: &str = "presenting this tab";
const BROWSER_PRESENTING_A_WINDOW_TITLE: &str = "presenting a window";
const BROWSER_PRESENTING_TO_EVERYONE_TITLE: &str = "presenting to everyone";
const BROWSER_STOP_PRESENTING_TITLE: &str = "stop presenting";
const BROWSER_SCREEN_RECORDING_TITLE: &str = "screen recording";
const BROWSER_RECORDING_YOUR_SCREEN_TITLE: &str = "recording your screen";
const BROWSER_RECORDING_SCREEN_TITLE: &str = "recording screen";
const BROWSER_SCREEN_IS_BEING_RECORDED_TITLE: &str = "screen is being recorded";
const BROWSER_BEING_RECORDED_TITLE: &str = "being recorded";
const WINDOW_TITLE_PUNCTUATION_NORMALIZATION_MARKER: &str =
    "Screen-share window title guard normalizes UI punctuation before matching.";
const STRONG_WINDOW_TITLE_ANY_APP_MARKER: &str =
    "Screen-share window title guard treats strong meeting/share titles from any visible app as risk.";
const MACOS_SCREEN_CAPTURE_UI_PROCESS: &str = "screencaptureui";
const MACOS_SCREEN_CAPTURE_CLI_PROCESS: &str = "screencapture";
const MACOS_REPLAYD_PROCESS: &str = "replayd";
const MACOS_SCREEN_CAPTURE_KIT_AGENT_PROCESS: &str = "screencapturekitagent";
const MACOS_WINDOW_TITLE_GUARD_MARKER: &str =
    "macOS window title screen-share guard failed closed:";
const MACOS_WINDOW_TITLE_PERMISSION_FALLBACK_MARKER: &str =
    "macOS window title screen-share guard permission denial falls back to OS capture protection.";
const MACOS_WINDOW_TITLE_TRANSIENT_ROW_MARKER: &str =
    "macOS window title screen-share guard skips transient System Events rows.";
const MACOS_WINDOW_TITLE_TIMEOUT_FALLBACK_MARKER: &str =
    "macOS window title screen-share guard timeout falls back to OS capture protection.";
#[cfg(target_os = "macos")]
const MACOS_WINDOW_TITLE_SHORT_TIMEOUT_MARKER: &str =
    "macOS window-title guard uses a short timeout so native privacy polling cannot stall.";
#[cfg(target_os = "macos")]
const MACOS_DIRECT_CAPTURE_PGREP_NO_MATCH_EXIT_CODE: i32 = 1;
#[cfg(target_os = "macos")]
const MACOS_LIBPROC_ALL_PIDS: u32 = 1;
#[cfg(target_os = "macos")]
const MACOS_LIBPROC_NAME_BUFFER_SIZE: usize = 4096;
const MACOS_PROCESS_GUARD_SHORT_CIRCUIT_MARKER: &str =
    "macOS process screen-share guard skips window-title scan after direct capture-process match.";
#[cfg(target_os = "macos")]
extern "C" {
    fn proc_listpids(type_: u32, typeinfo: u32, buffer: *mut c_void, buffersize: i32) -> i32;
    fn proc_name(pid: i32, buffer: *mut c_void, buffersize: u32) -> i32;
}
#[cfg(target_os = "macos")]
const MACOS_VISIBLE_WINDOW_TITLE_SCRIPT: &str = r#"
set previousDelimiters to AppleScript's text item delimiters
set windowTitleRows to {}
tell application "System Events"
  repeat with candidateProcess in processes
    try
      if background only of candidateProcess is false then
        set processName to name of candidateProcess as text
        set processId to unix id of candidateProcess as text
        repeat with candidateWindow in windows of candidateProcess
          try
            set windowTitle to name of candidateWindow as text
            if windowTitle is not "" then set end of windowTitleRows to processId & tab & processName & tab & windowTitle
          end try
        end repeat
      end if
    end try
  end repeat
end tell
set AppleScript's text item delimiters to linefeed
set serializedRows to windowTitleRows as text
set AppleScript's text item delimiters to previousDelimiters
return serializedRows
"#;
const PACKAGE_PRIVACY_SHIELD_WEBVIEW_MARKERS: &[&str] = &[
    EDGE_WEBVIEW_HOST_PROCESS,
    EDGE_PWA_HOST_PROCESS,
    APPLICATION_FRAME_HOST_PROCESS,
    CHROME_PWA_HOST_PROCESS,
    BRAVE_PWA_HOST_PROCESS,
    OPERA_PWA_HOST_PROCESS,
    VIVALDI_PWA_HOST_PROCESS,
    ZEN_BROWSER_PROCESS,
    ZEN_BROWSER_EXE_PROCESS,
    CHROMIUM_BROWSER_PROCESS,
    CHROMIUM_BROWSER_EXE_PROCESS,
    LIBREWOLF_BROWSER_PROCESS,
    LIBREWOLF_BROWSER_EXE_PROCESS,
    WATERFOX_BROWSER_PROCESS,
    WATERFOX_BROWSER_EXE_PROCESS,
    FLOORP_BROWSER_PROCESS,
    FLOORP_BROWSER_EXE_PROCESS,
    DUCKDUCKGO_BROWSER_PROCESS,
    DUCKDUCKGO_BROWSER_EXE_PROCESS,
    MULLVAD_BROWSER_PROCESS,
    MULLVAD_BROWSER_DASH_PROCESS,
    WEBEX_HOST_PROCESS,
    SCREENCONNECT_WINDOWS_CLIENT_PROCESS,
    SCREENCONNECT_CLIENT_PROCESS,
    ZOHO_ASSIST_PROCESS,
    ZOHO_ASSIST_CONNECT_PROCESS,
    TEAMS_WEB_MEETING_ORIGIN,
    TEAMS_CONSUMER_WEB_MEETING_ORIGIN,
    TEAMS_CLOUD_WEB_MEETING_ORIGIN,
    MEET_WEB_MEETING_ORIGIN,
    GOOGLE_MEET_CALL_ORIGIN,
    GOOGLE_MEET_SHORT_TITLE_PREFIX,
    ZOOM_WEB_MEETING_ORIGIN,
    SKYPE_WEB_MEETING_ORIGIN,
    SLACK_WEB_HUDDLE_ORIGIN,
    DISCORD_WEB_HUDDLE_ORIGIN,
    WHATSAPP_WEB_CALL_ORIGIN,
    WEBEX_WEB_MEETING_ORIGIN,
    GOTO_WEB_MEETING_ORIGIN,
    JITSI_WEB_MEETING_ORIGIN,
    AMAZON_CHIME_WEB_MEETING_ORIGIN,
    WHEREBY_WEB_MEETING_ORIGIN,
    DAILY_WEB_MEETING_ORIGIN,
    GATHER_WEB_MEETING_ORIGIN,
    TALKY_WEB_MEETING_ORIGIN,
    DEMIO_WEB_MEETING_ORIGIN,
    REMO_WEB_MEETING_ORIGIN,
    RIVERSIDE_WEB_MEETING_ORIGIN,
    STREAMYARD_WEB_MEETING_ORIGIN,
    LIVESTORM_WEB_MEETING_ORIGIN,
    BIGBLUEBUTTON_MEETING_TITLE,
    TELLA_WEB_RECORDER_ORIGIN,
    SCREENPAL_WEB_RECORDER_ORIGIN,
    VEED_WEB_RECORDER_ORIGIN,
    CLIPCHAMP_WEB_RECORDER_ORIGIN,
    VIDYARD_WEB_RECORDER_ORIGIN,
    DESCRIPT_WEB_RECORDER_ORIGIN,
    RESTREAM_WEB_STUDIO_ORIGIN,
    VDO_NINJA_WEB_CALL_ORIGIN,
    PANOPTO_WEB_CAPTURE_ORIGIN,
    KALTURA_WEB_CAPTURE_ORIGIN,
    SCREENITY_WEB_CAPTURE_TITLE,
    "screenpal.exe",
    "screencast-o-matic",
    "descript.exe",
    "vidyard.exe",
    "clipchamp.exe",
    BROWSER_YOU_ARE_SHARING_TITLE,
    BROWSER_YOURE_SHARING_TITLE,
    BROWSER_SHARING_YOUR_SCREEN_TITLE,
    BROWSER_SHARING_YOUR_ENTIRE_SCREEN_TITLE,
    BROWSER_SHARING_ENTIRE_SCREEN_TITLE,
    BROWSER_SHARING_THIS_TAB_TITLE,
    BROWSER_SHARING_A_BROWSER_TAB_TITLE,
    BROWSER_SHARING_A_CHROME_TAB_TITLE,
    BROWSER_SHARING_A_WINDOW_TITLE,
    BROWSER_SHARING_AN_APPLICATION_WINDOW_TITLE,
    BROWSER_THIS_TAB_IS_BEING_SHARED_TITLE,
    BROWSER_THIS_WINDOW_IS_BEING_SHARED_TITLE,
    BROWSER_APPLICATION_WINDOW_IS_BEING_SHARED_TITLE,
    BROWSER_THIS_SCREEN_IS_BEING_SHARED_TITLE,
    BROWSER_SCREEN_IS_BEING_SHARED_TITLE,
    BROWSER_STOP_SHARING_TITLE,
    BROWSER_YOU_ARE_PRESENTING_TITLE,
    BROWSER_YOURE_PRESENTING_TITLE,
    BROWSER_PRESENTING_YOUR_SCREEN_TITLE,
    BROWSER_PRESENTING_THIS_TAB_TITLE,
    BROWSER_PRESENTING_A_WINDOW_TITLE,
    BROWSER_PRESENTING_TO_EVERYONE_TITLE,
    BROWSER_STOP_PRESENTING_TITLE,
    BROWSER_SCREEN_RECORDING_TITLE,
    BROWSER_RECORDING_YOUR_SCREEN_TITLE,
    BROWSER_RECORDING_SCREEN_TITLE,
    BROWSER_SCREEN_IS_BEING_RECORDED_TITLE,
    BROWSER_BEING_RECORDED_TITLE,
    SCREEN_SHARE_GUARD_COMMAND_TIMEOUT_MARKER,
    WINDOW_TITLE_PUNCTUATION_NORMALIZATION_MARKER,
    STRONG_WINDOW_TITLE_ANY_APP_MARKER,
    MACOS_SCREEN_CAPTURE_UI_PROCESS,
    MACOS_SCREEN_CAPTURE_CLI_PROCESS,
    MACOS_REPLAYD_PROCESS,
    MACOS_SCREEN_CAPTURE_KIT_AGENT_PROCESS,
    MACOS_WINDOW_TITLE_GUARD_MARKER,
    MACOS_WINDOW_TITLE_PERMISSION_FALLBACK_MARKER,
    MACOS_WINDOW_TITLE_TRANSIENT_ROW_MARKER,
    MACOS_WINDOW_TITLE_TIMEOUT_FALLBACK_MARKER,
    #[cfg(target_os = "macos")]
    MACOS_WINDOW_TITLE_SHORT_TIMEOUT_MARKER,
    #[cfg(target_os = "macos")]
    NATIVE_PRIVACY_SHIELD_MACOS_CORE_GRAPHICS_TITLE_GATE_MARKER,
    #[cfg(target_os = "macos")]
    NATIVE_PRIVACY_SHIELD_MACOS_CORE_GRAPHICS_TITLE_FAST_SCAN_MARKER,
    #[cfg(target_os = "macos")]
    NATIVE_PRIVACY_SHIELD_MACOS_REDACTED_BROWSER_TITLE_MARKER,
    #[cfg(target_os = "windows")]
    NATIVE_PRIVACY_SHIELD_WINDOWS_ENUMWINDOWS_TITLE_MARKER,
    #[cfg(target_os = "windows")]
    NATIVE_PRIVACY_SHIELD_WINDOWS_ENUMWINDOWS_FAST_GATE_MARKER,
    #[cfg(target_os = "windows")]
    NATIVE_PRIVACY_SHIELD_WINDOWS_UNAVAILABLE_BROWSER_TITLE_MARKER,
    #[cfg(target_os = "windows")]
    NATIVE_PRIVACY_SHIELD_WINDOWS_TOOLHELP_PROCESS_MARKER,
];

#[derive(Debug, Clone, PartialEq)]
pub enum NativePrivacyShieldDecision {
    Allow,
    Hide { reason: String },
}

const WATCHED_SCREEN_SHARE_PROCESSES: &[&str] = &[
    // Native meeting and huddle apps.
    "zoom.exe",
    "zoom.us",
    "teams.exe",
    "teams",
    "ms-teams.exe",
    "microsoft teams",
    "microsoft teams helper",
    "msteams",
    "zoom workplace",
    "zoom meetings",
    "discord.exe",
    "discord",
    "slack.exe",
    "slack",
    "skype.exe",
    "skype",
    "skype for business",
    "lync.exe",
    "webexmta.exe",
    WEBEX_HOST_PROCESS,
    "webex",
    "ciscocollabhost.exe",
    "cisco webex meetings",
    "gotomeeting.exe",
    "gotomeeting",
    "g2mcomm.exe",
    "g2mstart.exe",
    "bluejeans.exe",
    "bluejeans",
    "ringcentral.exe",
    "ringcentral",
    "ringcentral meetings",
    "jitsi.exe",
    "jitsi",
    "jitsi meet",
    "join.me.exe",
    "join.me",
    "amazon chime.exe",
    "amazon chime",
    "whereby.exe",
    "whereby",
    "daily.exe",
    "daily",
    "gather.exe",
    "gather",
    "around.exe",
    "around",
    "mmhmm.exe",
    "mmhmm",
    "telegram.exe",
    "telegram",
    "whatsapp.exe",
    "whatsapp",
    "signal.exe",
    "signal",
    "lark.exe",
    "lark",
    "feishu",
    "dingtalk.exe",
    "dingtalk",
    "facetime",
    "google meet",
    // Browser shells used by Google Meet, browser Teams, Webex, HackerRank, etc.
    "chrome.exe",
    "chrome",
    "google chrome",
    "google chrome helper",
    "google chrome helper (renderer)",
    "msedge.exe",
    "microsoft edge",
    "firefox.exe",
    "firefox",
    "safari",
    "safari web content",
    "brave.exe",
    "brave browser",
    "arc",
    "arc helper",
    "opera.exe",
    "opera",
    "vivaldi.exe",
    "vivaldi",
    ZEN_BROWSER_PROCESS,
    ZEN_BROWSER_EXE_PROCESS,
    CHROMIUM_BROWSER_PROCESS,
    CHROMIUM_BROWSER_EXE_PROCESS,
    LIBREWOLF_BROWSER_PROCESS,
    LIBREWOLF_BROWSER_EXE_PROCESS,
    WATERFOX_BROWSER_PROCESS,
    WATERFOX_BROWSER_EXE_PROCESS,
    FLOORP_BROWSER_PROCESS,
    FLOORP_BROWSER_EXE_PROCESS,
    DUCKDUCKGO_BROWSER_PROCESS,
    DUCKDUCKGO_BROWSER_EXE_PROCESS,
    MULLVAD_BROWSER_PROCESS,
    MULLVAD_BROWSER_DASH_PROCESS,
    // Recording and broadcast tools that can expose overlays outside meeting apps.
    "obs64.exe",
    "obs32.exe",
    "obs",
    "streamlabs obs",
    "streamlabs desktop",
    "quicktime player",
    "quicktimeplayerx",
    "loom.exe",
    "loom",
    "camtasia.exe",
    "camtasia",
    "snagit32.exe",
    "snagit64.exe",
    "snagit",
    "screenflow",
    "xsplit.core.exe",
    "xsplit",
    "sharex.exe",
    "bandicam.exe",
    "obs studio",
    "screenflick",
    "screenflickhelper",
    "screenium",
    "capto",
    "monosnap",
    "shottr",
    "zappy",
    "recordit",
    "kaltura capture",
    "panopto recorder",
    "bbflashbackrecorder.exe",
    "flashback recorder",
    "movavi screen recorder",
    "icecream screen recorder",
    "apowersoft screen recorder",
    "screenity",
    // Remote desktop and support tools also expose the overlay to another viewer.
    "teamviewer.exe",
    "teamviewer",
    "anydesk.exe",
    "anydesk",
    "rustdesk.exe",
    "rustdesk",
    "remoting_host.exe",
    "chrome remote desktop",
    "screen sharing",
    "screensharingagent",
    "screensharingd",
    "vncviewer.exe",
    "vnc viewer",
    "vncserver.exe",
    "vnc server",
    "parsecd.exe",
    "parsec.exe",
    "parsec",
    "splashtop streamer",
    "srserver.exe",
    "quickassist.exe",
    "msra.exe",
    "mstsc.exe",
    "msrdc.exe",
    "msrdcw.exe",
    "remotehelp.exe",
    "logmein.exe",
    "logmein",
    "logmeinrescue.exe",
    "lmi_rescue.exe",
    "goto opener.exe",
    "bomgar-scc.exe",
    "bomgar-rep.exe",
    "beyondtrust",
    "jump desktop",
    "jumpdesktopconnect",
    "nomachine",
    "nxplayer",
    "nxserver",
    "dwagent.exe",
    "dwagent",
    "meshagent.exe",
    "meshagent",
    "dwrcc.exe",
    "dameware mini remote control",
    "supremo.exe",
    "supremo",
    "remotepc.exe",
    "remotepc",
    "getscreen.me",
    "aeroadmin.exe",
    "aeroadmin",
    "sunloginclient.exe",
    "sunloginclient",
    "todesk.exe",
    "todesk",
    "ultraviewer.exe",
    "ultraviewer",
    "connectwisecontrol.client.exe",
    "screenconnect.clientservice.exe",
    SCREENCONNECT_WINDOWS_CLIENT_PROCESS,
    SCREENCONNECT_CLIENT_PROCESS,
    ZOHO_ASSIST_PROCESS,
    ZOHO_ASSIST_CONNECT_PROCESS,
    // Local capture tools are treated as sharing risk by the always-on privacy shield.
    "snippingtool.exe",
    "screenclippinghost.exe",
    "gamebar.exe",
    "gamebarpresencewriter.exe",
    "nvidia share.exe",
    "nvidia broadcast.exe",
    "screenrec.exe",
    "screenrec",
    "cleanshot x",
    "kap",
    "screen studio",
    MACOS_SCREEN_CAPTURE_UI_PROCESS,
    MACOS_SCREEN_CAPTURE_CLI_PROCESS,
    MACOS_REPLAYD_PROCESS,
    MACOS_SCREEN_CAPTURE_KIT_AGENT_PROCESS,
    "screenpresso.exe",
    "camtasiarecorder.exe",
    "techsmith capture",
    "screenpal.exe",
    "screenpal",
    "screencast-o-matic.exe",
    "screencast-o-matic",
    "descript.exe",
    "descript",
    "vidyard.exe",
    "vidyard",
    "clipchamp.exe",
    "clipchamp",
    "ecamm live",
];

const TITLE_ONLY_SCREEN_SHARE_PROCESSES: &[&str] = &[
    "chrome.exe",
    "chrome",
    "google chrome",
    "google chrome helper",
    "google chrome helper (renderer)",
    "msedge.exe",
    "microsoft edge",
    "firefox.exe",
    "firefox",
    "safari",
    "safari web content",
    "brave.exe",
    "brave browser",
    "arc",
    "arc helper",
    "opera.exe",
    "opera",
    "vivaldi.exe",
    "vivaldi",
    ZEN_BROWSER_PROCESS,
    ZEN_BROWSER_EXE_PROCESS,
    CHROMIUM_BROWSER_PROCESS,
    CHROMIUM_BROWSER_EXE_PROCESS,
    LIBREWOLF_BROWSER_PROCESS,
    LIBREWOLF_BROWSER_EXE_PROCESS,
    WATERFOX_BROWSER_PROCESS,
    WATERFOX_BROWSER_EXE_PROCESS,
    FLOORP_BROWSER_PROCESS,
    FLOORP_BROWSER_EXE_PROCESS,
    DUCKDUCKGO_BROWSER_PROCESS,
    DUCKDUCKGO_BROWSER_EXE_PROCESS,
    MULLVAD_BROWSER_PROCESS,
    MULLVAD_BROWSER_DASH_PROCESS,
    "whatsapp.exe",
    "whatsapp",
    MACOS_REPLAYD_PROCESS,
];

const WATCHED_SCREEN_SHARE_TITLES: &[&str] = &[
    "google meet",
    MEET_WEB_MEETING_ORIGIN,
    GOOGLE_MEET_CALL_ORIGIN,
    GOOGLE_MEET_SHORT_TITLE_PREFIX,
    "microsoft teams",
    "teams meeting",
    TEAMS_WEB_MEETING_ORIGIN,
    TEAMS_CONSUMER_WEB_MEETING_ORIGIN,
    TEAMS_CLOUD_WEB_MEETING_ORIGIN,
    "zoom meeting",
    ZOOM_WEB_MEETING_ORIGIN,
    SKYPE_WEB_MEETING_ORIGIN,
    "webex meeting",
    WEBEX_WEB_MEETING_ORIGIN,
    GOTO_WEB_MEETING_ORIGIN,
    JITSI_WEB_MEETING_ORIGIN,
    AMAZON_CHIME_WEB_MEETING_ORIGIN,
    "whereby",
    WHEREBY_WEB_MEETING_ORIGIN,
    "daily",
    DAILY_WEB_MEETING_ORIGIN,
    "gather",
    GATHER_WEB_MEETING_ORIGIN,
    TALKY_WEB_MEETING_ORIGIN,
    DEMIO_WEB_MEETING_ORIGIN,
    REMO_WEB_MEETING_ORIGIN,
    "riverside",
    RIVERSIDE_WEB_MEETING_ORIGIN,
    "streamyard",
    STREAMYARD_WEB_MEETING_ORIGIN,
    "livestorm",
    LIVESTORM_WEB_MEETING_ORIGIN,
    BIGBLUEBUTTON_MEETING_TITLE,
    "tella",
    TELLA_WEB_RECORDER_ORIGIN,
    "screenpal",
    SCREENPAL_WEB_RECORDER_ORIGIN,
    VEED_WEB_RECORDER_ORIGIN,
    CLIPCHAMP_WEB_RECORDER_ORIGIN,
    VIDYARD_WEB_RECORDER_ORIGIN,
    DESCRIPT_WEB_RECORDER_ORIGIN,
    RESTREAM_WEB_STUDIO_ORIGIN,
    VDO_NINJA_WEB_CALL_ORIGIN,
    PANOPTO_WEB_CAPTURE_ORIGIN,
    KALTURA_WEB_CAPTURE_ORIGIN,
    SCREENITY_WEB_CAPTURE_TITLE,
    "slack huddle",
    SLACK_WEB_HUDDLE_ORIGIN,
    "discord",
    DISCORD_WEB_HUDDLE_ORIGIN,
    WHATSAPP_WEB_CALL_ORIGIN,
    "screen sharing",
    "screen share",
    BROWSER_YOU_ARE_SHARING_TITLE,
    BROWSER_YOURE_SHARING_TITLE,
    BROWSER_SHARING_YOUR_SCREEN_TITLE,
    BROWSER_SHARING_YOUR_ENTIRE_SCREEN_TITLE,
    BROWSER_SHARING_ENTIRE_SCREEN_TITLE,
    BROWSER_SHARING_THIS_TAB_TITLE,
    BROWSER_SHARING_A_BROWSER_TAB_TITLE,
    BROWSER_SHARING_A_CHROME_TAB_TITLE,
    BROWSER_SHARING_A_WINDOW_TITLE,
    BROWSER_SHARING_AN_APPLICATION_WINDOW_TITLE,
    BROWSER_THIS_TAB_IS_BEING_SHARED_TITLE,
    BROWSER_THIS_WINDOW_IS_BEING_SHARED_TITLE,
    BROWSER_APPLICATION_WINDOW_IS_BEING_SHARED_TITLE,
    BROWSER_THIS_SCREEN_IS_BEING_SHARED_TITLE,
    BROWSER_SCREEN_IS_BEING_SHARED_TITLE,
    BROWSER_STOP_SHARING_TITLE,
    BROWSER_YOU_ARE_PRESENTING_TITLE,
    BROWSER_YOURE_PRESENTING_TITLE,
    BROWSER_PRESENTING_YOUR_SCREEN_TITLE,
    BROWSER_PRESENTING_THIS_TAB_TITLE,
    BROWSER_PRESENTING_A_WINDOW_TITLE,
    BROWSER_PRESENTING_TO_EVERYONE_TITLE,
    BROWSER_STOP_PRESENTING_TITLE,
    BROWSER_SCREEN_RECORDING_TITLE,
    BROWSER_RECORDING_YOUR_SCREEN_TITLE,
    BROWSER_RECORDING_SCREEN_TITLE,
    BROWSER_SCREEN_IS_BEING_RECORDED_TITLE,
    BROWSER_BEING_RECORDED_TITLE,
    #[cfg(target_os = "macos")]
    NATIVE_PRIVACY_SHIELD_MACOS_REDACTED_BROWSER_TITLE_MARKER,
    #[cfg(target_os = "windows")]
    NATIVE_PRIVACY_SHIELD_WINDOWS_UNAVAILABLE_BROWSER_TITLE_MARKER,
    "presenting",
    "hackerrank interview",
    "interview - google meet",
    "interview - microsoft teams",
];

const SCREEN_SHARE_TITLE_HOST_PROCESSES: &[&str] = &[
    EDGE_WEBVIEW_HOST_PROCESS,
    EDGE_PWA_HOST_PROCESS,
    APPLICATION_FRAME_HOST_PROCESS,
    CHROME_PWA_HOST_PROCESS,
    BRAVE_PWA_HOST_PROCESS,
    OPERA_PWA_HOST_PROCESS,
    VIVALDI_PWA_HOST_PROCESS,
];

pub fn detect_screen_share_status() -> anyhow::Result<ScreenShareStatus> {
    retain_package_privacy_shield_webview_markers();

    #[cfg(target_os = "windows")]
    {
        if let Some(status) = detect_windows_toolhelp_process_privacy_status() {
            return Ok(status);
        }

        let output = run_screen_share_guard_command("tasklist", &["/V", "/FO", "CSV", "/NH"])?;

        if !output.status.success() {
            return Err(anyhow::anyhow!(
                "Could not query running processes for screen-share guard"
            ));
        }

        let mut processes = parse_tasklist_csv(&String::from_utf8_lossy(&output.stdout));
        processes.extend(detect_windows_visible_window_title_processes());
        return Ok(screen_share_status_for_processes(processes));
    }

    #[cfg(target_os = "macos")]
    {
        let output = run_screen_share_guard_command("ps", &["-axo", "pid=,comm="])?;

        if !output.status.success() {
            return Err(anyhow::anyhow!(
                "Could not query running processes for screen-share guard"
            ));
        }

        let mut processes = parse_unix_process_list(&String::from_utf8_lossy(&output.stdout));
        let direct_process_status = screen_share_status_for_processes(processes.clone());
        if direct_process_status.active {
            std::hint::black_box(MACOS_PROCESS_GUARD_SHORT_CIRCUIT_MARKER);
            return Ok(direct_process_status);
        }

        processes.extend(detect_macos_core_graphics_visible_window_title_processes());
        let core_graphics_status = screen_share_status_for_processes(processes.clone());
        if core_graphics_status.active {
            return Ok(core_graphics_status);
        }

        processes.extend(detect_macos_visible_window_title_processes()?);

        return Ok(screen_share_status_for_processes(processes));
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        Ok(ScreenShareStatus {
            active: false,
            matched_processes: Vec::new(),
            message: Some(
                "Screen-share process guard is only implemented on Windows and macOS in this build."
                    .to_string(),
            ),
        })
    }
}

fn retain_package_privacy_shield_webview_markers() {
    std::hint::black_box(PACKAGE_PRIVACY_SHIELD_WEBVIEW_MARKERS);
}

#[cfg(target_os = "macos")]
fn detect_macos_visible_window_title_processes() -> anyhow::Result<Vec<ScreenShareProcess>> {
    std::hint::black_box(MACOS_WINDOW_TITLE_GUARD_MARKER);

    std::hint::black_box(MACOS_WINDOW_TITLE_SHORT_TIMEOUT_MARKER);
    let output = match run_screen_share_guard_command_with_timeout(
        "osascript",
        &["-e", MACOS_VISIBLE_WINDOW_TITLE_SCRIPT],
        MACOS_WINDOW_TITLE_GUARD_COMMAND_TIMEOUT,
    ) {
        Ok(output) => output,
        Err(error) => {
            let detail = error.to_string();
            if let Some(marker) = macos_window_title_guard_fallback_marker(&detail) {
                std::hint::black_box(marker);
                return Ok(Vec::new());
            }

            return Err(anyhow::anyhow!("{MACOS_WINDOW_TITLE_GUARD_MARKER} {error}"));
        }
    };

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let detail = stderr.trim();
        if let Some(marker) = macos_window_title_guard_fallback_marker(detail) {
            std::hint::black_box(marker);
            return Ok(Vec::new());
        }

        return Err(anyhow::anyhow!(
            "{} {}",
            MACOS_WINDOW_TITLE_GUARD_MARKER,
            if detail.is_empty() {
                "osascript exited without stderr"
            } else {
                detail
            }
        ));
    }

    Ok(parse_macos_window_title_rows(&String::from_utf8_lossy(
        &output.stdout,
    )))
}

fn macos_window_title_guard_fallback_marker(detail: &str) -> Option<&'static str> {
    if macos_window_title_guard_permission_denied(detail) {
        return Some(MACOS_WINDOW_TITLE_PERMISSION_FALLBACK_MARKER);
    }

    if macos_window_title_guard_timed_out(detail) {
        return Some(MACOS_WINDOW_TITLE_TIMEOUT_FALLBACK_MARKER);
    }

    if macos_window_title_guard_transient_system_events_error(detail) {
        return Some(MACOS_WINDOW_TITLE_TRANSIENT_ROW_MARKER);
    }

    None
}

fn macos_window_title_guard_permission_denied(detail: &str) -> bool {
    let normalized = detail.to_ascii_lowercase();
    [
        "not authorized",
        "not authorised",
        "not allowed",
        "assistive access",
        "accessibility",
        "automation",
        "operation not permitted",
        "-1743",
        "-25211",
    ]
    .iter()
    .any(|candidate| normalized.contains(candidate))
}

fn macos_window_title_guard_timed_out(detail: &str) -> bool {
    detail.contains(SCREEN_SHARE_GUARD_COMMAND_TIMEOUT_MARKER)
}

fn macos_window_title_guard_transient_system_events_error(detail: &str) -> bool {
    let normalized = detail.to_ascii_lowercase();
    normalized.contains("invalid index") || normalized.contains("-1719")
}

fn run_screen_share_guard_command(program: &str, args: &[&str]) -> anyhow::Result<Output> {
    run_screen_share_guard_command_with_timeout(program, args, SCREEN_SHARE_GUARD_COMMAND_TIMEOUT)
}

fn run_screen_share_guard_command_with_timeout(
    program: &str,
    args: &[&str],
    timeout: Duration,
) -> anyhow::Result<Output> {
    std::hint::black_box(SCREEN_SHARE_GUARD_COMMAND_TIMEOUT_MARKER);

    let mut child = Command::new(program)
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| {
            anyhow::anyhow!("Could not start screen-share guard command {program}: {error}")
        })?;

    let mut stdout = child
        .stdout
        .take()
        .ok_or_else(|| anyhow::anyhow!("Could not capture {program} stdout"))?;
    let mut stderr = child
        .stderr
        .take()
        .ok_or_else(|| anyhow::anyhow!("Could not capture {program} stderr"))?;
    let stdout_reader = thread::spawn(move || {
        let mut buffer = Vec::new();
        stdout.read_to_end(&mut buffer).map(|_| buffer)
    });
    let stderr_reader = thread::spawn(move || {
        let mut buffer = Vec::new();
        stderr.read_to_end(&mut buffer).map(|_| buffer)
    });

    let started_at = Instant::now();
    loop {
        if let Some(status) = child.try_wait().map_err(|error| {
            anyhow::anyhow!("Could not poll screen-share guard command {program}: {error}")
        })? {
            let stdout = collect_screen_share_guard_output(program, "stdout", stdout_reader)?;
            let stderr = collect_screen_share_guard_output(program, "stderr", stderr_reader)?;
            return Ok(Output {
                status,
                stdout,
                stderr,
            });
        }

        if started_at.elapsed() >= timeout {
            let _ = child.kill();
            let _ = thread::Builder::new()
                .name(format!("screen-share-guard-reap-{program}"))
                .spawn(move || {
                    let _ = child.wait();
                });
            drop(stdout_reader);
            drop(stderr_reader);
            return Err(anyhow::anyhow!(
                "{SCREEN_SHARE_GUARD_COMMAND_TIMEOUT_MARKER} {program} exceeded {}ms.",
                timeout.as_millis()
            ));
        }

        thread::sleep(Duration::from_millis(10));
    }
}

fn collect_screen_share_guard_output(
    program: &str,
    stream: &str,
    reader: thread::JoinHandle<std::io::Result<Vec<u8>>>,
) -> anyhow::Result<Vec<u8>> {
    reader
        .join()
        .map_err(|_| anyhow::anyhow!("Could not join {program} {stream} reader"))?
        .map_err(|error| anyhow::anyhow!("Could not read {program} {stream}: {error}"))
}

pub fn native_privacy_shield_decision(
    status: anyhow::Result<ScreenShareStatus>,
) -> NativePrivacyShieldDecision {
    match status {
        Ok(status) if status.active => NativePrivacyShieldDecision::Hide {
            reason: status.message.unwrap_or_else(|| {
                "Known screen-sharing or recording process is running.".to_string()
            }),
        },
        Ok(status) if screen_share_guard_is_unsupported(&status) => {
            NativePrivacyShieldDecision::Hide {
                reason: "Screen-share guard is not available on this platform.".to_string(),
            }
        }
        Ok(_) => NativePrivacyShieldDecision::Allow,
        Err(error) => NativePrivacyShieldDecision::Hide {
            reason: format!("Screen-share guard failed closed: {error}"),
        },
    }
}

fn screen_share_guard_is_unsupported(status: &ScreenShareStatus) -> bool {
    status
        .message
        .as_deref()
        .is_some_and(|message| message.contains("only implemented on Windows and macOS"))
}

pub fn native_privacy_shield_decision_for_overlay_protection(
    status: &crate::overlay::OverlayProtectionStatus,
) -> NativePrivacyShieldDecision {
    if status.capture_exclusion == "enabled" {
        return NativePrivacyShieldDecision::Allow;
    }

    let detail = status
        .message
        .as_deref()
        .unwrap_or("capture exclusion reported an unsafe state");

    NativePrivacyShieldDecision::Hide {
        reason: format!(
            "Capture exclusion is not enforced: {}. {detail}",
            status.capture_exclusion
        ),
    }
}

pub fn start_native_privacy_shield(app: tauri::AppHandle) -> anyhow::Result<()> {
    std::hint::black_box(NATIVE_PRIVACY_SHIELD_STARTS_BEFORE_INITIAL_SHOW_MARKER);
    std::hint::black_box(NATIVE_PRIVACY_SHIELD_FAST_POLL_MARKER);
    std::hint::black_box(NATIVE_PRIVACY_SHIELD_SKIPS_WINDOW_TITLE_SCAN_MARKER);
    std::hint::black_box(NATIVE_PRIVACY_SHIELD_MACOS_PGREP_CAPTURE_MARKER);
    std::hint::black_box(NATIVE_PRIVACY_SHIELD_REFRESHES_CAPTURE_BEFORE_SHARE_HIDE_MARKER);
    std::hint::black_box(NATIVE_PRIVACY_SHIELD_MAIN_THREAD_WINDOW_UPDATE_MARKER);
    std::hint::black_box(NATIVE_PRIVACY_SHIELD_SHARE_RISK_LATCH_MARKER);

    #[cfg(target_os = "macos")]
    start_macos_window_title_privacy_scan_thread()?;
    #[cfg(target_os = "macos")]
    start_macos_core_graphics_title_privacy_scan_thread()?;

    thread::Builder::new()
        .name("screen-share-privacy-shield".to_string())
        .spawn(move || {
            let mut share_risk_was_active = false;
            loop {
                let decision = native_privacy_shield_decision(
                    detect_screen_share_status_for_native_privacy_shield(),
                );
                let share_risk_is_active =
                    matches!(decision, NativePrivacyShieldDecision::Hide { .. });
                NATIVE_PRIVACY_SHIELD_SHARE_RISK_ACTIVE
                    .store(share_risk_is_active, Ordering::Relaxed);
                let restore_after_share_risk =
                    matches!(decision, NativePrivacyShieldDecision::Allow) && share_risk_was_active;
                share_risk_was_active = share_risk_is_active;
                let main_thread_app = app.clone();
                let _ = app.run_on_main_thread(move || {
                    apply_native_privacy_shield_window_update(
                        &main_thread_app,
                        decision,
                        restore_after_share_risk,
                    );
                });

                thread::sleep(NATIVE_PRIVACY_SHIELD_INTERVAL);
            }
        })
        .map(|_| ())
        .map_err(|error| {
            anyhow::anyhow!(
                "{}",
                native_privacy_shield_thread_start_error_message(error)
            )
        })
}

pub fn detect_screen_share_status_for_native_privacy_shield() -> anyhow::Result<ScreenShareStatus> {
    retain_package_privacy_shield_webview_markers();

    #[cfg(target_os = "macos")]
    {
        if let Some(status) = detect_macos_direct_capture_process_status()? {
            return Ok(status);
        }

        let output = run_screen_share_guard_command("ps", &["-axo", "pid=,comm="])?;

        if !output.status.success() {
            return Err(anyhow::anyhow!(
                "Could not query running processes for screen-share guard"
            ));
        }

        let processes = parse_unix_process_list(&String::from_utf8_lossy(&output.stdout));
        let direct_process_status = screen_share_status_for_processes(processes);
        if direct_process_status.active {
            std::hint::black_box(MACOS_PROCESS_GUARD_SHORT_CIRCUIT_MARKER);
            return Ok(direct_process_status);
        }

        if let Some(status) = macos_window_title_privacy_risk_status() {
            return Ok(status);
        }

        std::hint::black_box(NATIVE_PRIVACY_SHIELD_SKIPS_WINDOW_TITLE_SCAN_MARKER);
        Ok(direct_process_status)
    }

    #[cfg(target_os = "windows")]
    {
        if let Some(status) = detect_windows_visible_window_title_privacy_status() {
            return Ok(status);
        }

        detect_screen_share_status()
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        detect_screen_share_status()
    }
}

pub fn detect_screen_share_status_for_native_visibility_gate() -> anyhow::Result<ScreenShareStatus>
{
    retain_package_privacy_shield_webview_markers();

    #[cfg(target_os = "macos")]
    {
        detect_macos_visibility_gate_process_status()
    }

    #[cfg(not(target_os = "macos"))]
    {
        detect_screen_share_status_for_native_privacy_shield()
    }
}

#[cfg(target_os = "macos")]
fn detect_macos_visibility_gate_process_status() -> anyhow::Result<ScreenShareStatus> {
    std::hint::black_box(NATIVE_PRIVACY_SHIELD_MACOS_CORE_GRAPHICS_TITLE_GATE_MARKER);

    if let Some(status) = detect_macos_direct_capture_process_status()? {
        return Ok(status);
    }

    let output = run_screen_share_guard_command("ps", &["-axo", "pid=,comm="])?;

    if !output.status.success() {
        return Err(anyhow::anyhow!(
            "Could not query running processes for screen-share guard"
        ));
    }

    let mut processes = parse_unix_process_list(&String::from_utf8_lossy(&output.stdout));
    let direct_process_status = screen_share_status_for_processes(processes.clone());
    if direct_process_status.active {
        std::hint::black_box(MACOS_PROCESS_GUARD_SHORT_CIRCUIT_MARKER);
        return Ok(direct_process_status);
    }

    processes.extend(detect_macos_core_graphics_visible_window_title_processes());
    let status = screen_share_status_for_processes(processes);
    MACOS_WINDOW_TITLE_PRIVACY_RISK_ACTIVE.store(status.active, Ordering::Relaxed);
    Ok(status)
}

#[cfg(target_os = "macos")]
fn start_macos_window_title_privacy_scan_thread() -> anyhow::Result<()> {
    std::hint::black_box(NATIVE_PRIVACY_SHIELD_MACOS_WINDOW_TITLE_BACKGROUND_SCAN_MARKER);

    thread::Builder::new()
        .name("macos-window-title-privacy-shield".to_string())
        .spawn(move || loop {
            thread::sleep(MACOS_WINDOW_TITLE_PRIVACY_SCAN_INTERVAL);
            if detect_macos_direct_capture_process_status()
                .ok()
                .flatten()
                .is_some()
            {
                MACOS_WINDOW_TITLE_PRIVACY_RISK_ACTIVE.store(false, Ordering::Relaxed);
                continue;
            }

            let active = detect_macos_window_title_privacy_risk().unwrap_or(false);
            MACOS_WINDOW_TITLE_PRIVACY_RISK_ACTIVE.store(active, Ordering::Relaxed);
        })
        .map(|_| ())
        .map_err(|error| anyhow::anyhow!("{error}"))
}

#[cfg(target_os = "macos")]
fn start_macos_core_graphics_title_privacy_scan_thread() -> anyhow::Result<()> {
    std::hint::black_box(NATIVE_PRIVACY_SHIELD_MACOS_CORE_GRAPHICS_TITLE_FAST_SCAN_MARKER);

    thread::Builder::new()
        .name("macos-coregraphics-title-privacy-shield".to_string())
        .spawn(move || loop {
            thread::sleep(MACOS_CORE_GRAPHICS_TITLE_PRIVACY_SCAN_INTERVAL);
            let active = screen_share_status_for_processes(
                detect_macos_core_graphics_visible_window_title_processes(),
            )
            .active;
            MACOS_CORE_GRAPHICS_TITLE_PRIVACY_RISK_ACTIVE.store(active, Ordering::Relaxed);
        })
        .map(|_| ())
        .map_err(|error| anyhow::anyhow!("{error}"))
}

#[cfg(target_os = "macos")]
fn detect_macos_window_title_privacy_risk() -> anyhow::Result<bool> {
    let processes = detect_macos_core_graphics_visible_window_title_processes();
    if screen_share_status_for_processes(processes).active {
        return Ok(true);
    }

    let processes = detect_macos_visible_window_title_processes()?;
    Ok(screen_share_status_for_processes(processes).active)
}

#[cfg(target_os = "macos")]
fn macos_window_title_privacy_risk_status() -> Option<ScreenShareStatus> {
    let core_graphics_risk_active =
        MACOS_CORE_GRAPHICS_TITLE_PRIVACY_RISK_ACTIVE.load(Ordering::Relaxed);
    let window_title_risk_active = MACOS_WINDOW_TITLE_PRIVACY_RISK_ACTIVE.load(Ordering::Relaxed);
    if !core_graphics_risk_active && !window_title_risk_active {
        return None;
    }

    if core_graphics_risk_active {
        std::hint::black_box(NATIVE_PRIVACY_SHIELD_MACOS_CORE_GRAPHICS_TITLE_FAST_SCAN_MARKER);
    }
    if window_title_risk_active {
        std::hint::black_box(NATIVE_PRIVACY_SHIELD_MACOS_WINDOW_TITLE_BACKGROUND_SCAN_MARKER);
    }
    Some(ScreenShareStatus {
        active: true,
        matched_processes: vec![ScreenShareProcess {
            name: if core_graphics_risk_active {
                "macOS CoreGraphics title privacy scan".to_string()
            } else {
                "macOS window-title privacy scan".to_string()
            },
            pid: None,
            window_title: Some("Browser meeting or sharing title detected".to_string()),
        }],
        message: Some("Browser meeting or sharing title is visible.".to_string()),
    })
}

#[cfg(target_os = "macos")]
fn detect_macos_direct_capture_process_status() -> anyhow::Result<Option<ScreenShareStatus>> {
    std::hint::black_box(NATIVE_PRIVACY_SHIELD_MACOS_PGREP_CAPTURE_MARKER);
    std::hint::black_box(NATIVE_PRIVACY_SHIELD_MACOS_PGREP_FAIL_CLOSED_MARKER);
    std::hint::black_box(NATIVE_PRIVACY_SHIELD_MACOS_LIBPROC_CAPTURE_MARKER);

    if let Some(status) = detect_macos_libproc_direct_capture_process_status() {
        return Ok(Some(status));
    }

    let mut matched_processes = Vec::new();
    for name in [
        MACOS_SCREEN_CAPTURE_CLI_PROCESS,
        MACOS_SCREEN_CAPTURE_UI_PROCESS,
        MACOS_SCREEN_CAPTURE_KIT_AGENT_PROCESS,
    ] {
        let output = run_screen_share_guard_command("pgrep", &["-x", name])?;
        if output.status.success() {
            matched_processes.extend(parse_pgrep_process_rows(
                name,
                &String::from_utf8_lossy(&output.stdout),
            ));
            continue;
        }

        if output.status.code() != Some(MACOS_DIRECT_CAPTURE_PGREP_NO_MATCH_EXIT_CODE) {
            return Err(macos_pgrep_query_error(name, &output));
        }
    }

    if matched_processes.is_empty() {
        Ok(None)
    } else {
        Ok(Some(ScreenShareStatus {
            active: true,
            matched_processes,
            message: Some("Known screen-sharing or recording process is running.".to_string()),
        }))
    }
}

#[cfg(target_os = "macos")]
fn detect_macos_libproc_direct_capture_process_status() -> Option<ScreenShareStatus> {
    let processes = macos_libproc_processes()?
        .into_iter()
        .filter(|process| is_macos_direct_capture_agent_name(&process.name))
        .collect();
    let status = screen_share_status_for_processes(processes);
    if status.active {
        Some(status)
    } else {
        None
    }
}

#[cfg(target_os = "macos")]
fn is_macos_direct_capture_agent_name(name: &str) -> bool {
    let normalized = normalize_process_name(name);
    [
        MACOS_SCREEN_CAPTURE_CLI_PROCESS,
        MACOS_SCREEN_CAPTURE_UI_PROCESS,
        MACOS_SCREEN_CAPTURE_KIT_AGENT_PROCESS,
    ]
    .iter()
    .any(|candidate| process_name_matches_candidate(&normalized, candidate))
}

#[cfg(target_os = "macos")]
fn macos_libproc_processes() -> Option<Vec<ScreenShareProcess>> {
    let requested_bytes =
        unsafe { proc_listpids(MACOS_LIBPROC_ALL_PIDS, 0, std::ptr::null_mut(), 0) };
    if requested_bytes <= 0 {
        return None;
    }

    let requested_pid_count = (requested_bytes as usize / std::mem::size_of::<i32>()) + 128;
    let mut pids = vec![0i32; requested_pid_count];
    let buffer_bytes = pids
        .len()
        .checked_mul(std::mem::size_of::<i32>())?
        .try_into()
        .ok()?;
    let returned_bytes = unsafe {
        proc_listpids(
            MACOS_LIBPROC_ALL_PIDS,
            0,
            pids.as_mut_ptr().cast::<c_void>(),
            buffer_bytes,
        )
    };
    if returned_bytes <= 0 {
        return None;
    }

    let returned_pid_count = returned_bytes as usize / std::mem::size_of::<i32>();
    Some(
        pids.into_iter()
            .take(returned_pid_count)
            .filter_map(macos_libproc_process)
            .collect(),
    )
}

#[cfg(target_os = "macos")]
fn macos_libproc_process(pid: i32) -> Option<ScreenShareProcess> {
    if pid <= 0 {
        return None;
    }

    let mut name_buffer = [0u8; MACOS_LIBPROC_NAME_BUFFER_SIZE];
    let name_length = unsafe {
        proc_name(
            pid,
            name_buffer.as_mut_ptr().cast::<c_void>(),
            name_buffer.len() as u32,
        )
    };
    if name_length <= 0 {
        return None;
    }

    let name = String::from_utf8_lossy(&name_buffer[..name_length as usize])
        .trim_end_matches('\0')
        .trim()
        .to_string();
    if name.is_empty() {
        return None;
    }

    Some(ScreenShareProcess {
        name,
        pid: Some(pid as u32),
        window_title: None,
    })
}

#[cfg(target_os = "macos")]
fn macos_pgrep_query_error(name: &str, output: &Output) -> anyhow::Error {
    let stderr = String::from_utf8_lossy(&output.stderr);
    let detail = stderr.trim();
    anyhow::anyhow!(
        "Could not query macOS direct capture agent {name} for screen-share guard{}",
        if detail.is_empty() {
            ".".to_string()
        } else {
            format!(": {detail}")
        }
    )
}

#[cfg(target_os = "macos")]
fn parse_pgrep_process_rows(name: &str, output: &str) -> Vec<ScreenShareProcess> {
    output
        .lines()
        .filter_map(|line| {
            let pid = line.trim().parse::<u32>().ok()?;
            Some(ScreenShareProcess {
                name: name.to_string(),
                pid: Some(pid),
                window_title: None,
            })
        })
        .collect()
}

#[cfg(target_os = "macos")]
fn detect_macos_core_graphics_visible_window_title_processes() -> Vec<ScreenShareProcess> {
    use objc2_core_foundation::CFDictionary;
    use objc2_core_graphics::{CGWindowListCopyWindowInfo, CGWindowListOption};

    std::hint::black_box(NATIVE_PRIVACY_SHIELD_MACOS_CORE_GRAPHICS_TITLE_GATE_MARKER);

    let mut processes = Vec::new();
    unsafe {
        let Some(windows) = CGWindowListCopyWindowInfo(
            CGWindowListOption::OptionOnScreenOnly | CGWindowListOption::ExcludeDesktopElements,
            0,
        ) else {
            return processes;
        };

        for index in 0..windows.count() {
            let window_ref = windows.value_at_index(index) as *const CFDictionary;
            if window_ref.is_null() {
                continue;
            }

            let window = &*window_ref;
            let Some(name) = cf_string(window, "kCGWindowOwnerName") else {
                continue;
            };
            let window_title = cf_string(window, "kCGWindowName")
                .map(|title| title.trim().to_string())
                .filter(|title| !title.is_empty());
            let window_title = match window_title {
                Some(title) => Some(title),
                None if is_screen_share_window_title_host_process(&name) => {
                    std::hint::black_box(NATIVE_PRIVACY_SHIELD_MACOS_REDACTED_BROWSER_TITLE_MARKER);
                    Some(NATIVE_PRIVACY_SHIELD_MACOS_REDACTED_BROWSER_TITLE_MARKER.to_string())
                }
                None => continue,
            };

            processes.push(ScreenShareProcess {
                name,
                pid: cf_number_i32(window, "kCGWindowOwnerPID").and_then(|pid| {
                    if pid <= 0 {
                        None
                    } else {
                        Some(pid as u32)
                    }
                }),
                window_title,
            });
        }
    }

    processes
}

#[cfg(target_os = "windows")]
fn detect_windows_visible_window_title_processes() -> Vec<ScreenShareProcess> {
    use windows::core::BOOL;
    use windows::Win32::Foundation::{HWND, LPARAM, TRUE};
    use windows::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetWindowThreadProcessId, IsWindowVisible,
    };

    std::hint::black_box(NATIVE_PRIVACY_SHIELD_WINDOWS_ENUMWINDOWS_TITLE_MARKER);

    extern "system" fn collect_window(hwnd: HWND, lparam: LPARAM) -> BOOL {
        if !unsafe { IsWindowVisible(hwnd) }.as_bool() {
            return TRUE;
        }

        let mut process_id = 0_u32;
        unsafe {
            GetWindowThreadProcessId(hwnd, Some(&mut process_id));
        }
        if process_id == 0 {
            return TRUE;
        }

        let name = read_windows_process_name(process_id).unwrap_or_else(|| process_id.to_string());
        let window_title = match read_windows_window_title(hwnd) {
            title if !title.is_empty() => Some(title),
            _ if is_screen_share_window_title_host_process(&name) => {
                std::hint::black_box(
                    NATIVE_PRIVACY_SHIELD_WINDOWS_UNAVAILABLE_BROWSER_TITLE_MARKER,
                );
                Some(NATIVE_PRIVACY_SHIELD_WINDOWS_UNAVAILABLE_BROWSER_TITLE_MARKER.to_string())
            }
            _ => return TRUE,
        };
        let processes = unsafe { &mut *(lparam.0 as *mut Vec<ScreenShareProcess>) };
        processes.push(ScreenShareProcess {
            name,
            pid: Some(process_id),
            window_title,
        });
        TRUE
    }

    let mut processes = Vec::new();
    let lparam = LPARAM((&mut processes as *mut Vec<ScreenShareProcess>) as isize);
    let _ = unsafe { EnumWindows(Some(collect_window), lparam) };
    processes
}

#[cfg(target_os = "windows")]
fn detect_windows_visible_window_title_privacy_status() -> Option<ScreenShareStatus> {
    std::hint::black_box(NATIVE_PRIVACY_SHIELD_WINDOWS_ENUMWINDOWS_FAST_GATE_MARKER);

    let status = screen_share_status_for_processes(detect_windows_visible_window_title_processes());
    status.active.then_some(status)
}

#[cfg(target_os = "windows")]
fn detect_windows_toolhelp_process_privacy_status() -> Option<ScreenShareStatus> {
    std::hint::black_box(NATIVE_PRIVACY_SHIELD_WINDOWS_TOOLHELP_PROCESS_MARKER);

    let status = screen_share_status_for_processes(detect_windows_toolhelp_processes());
    status.active.then_some(status)
}

#[cfg(target_os = "windows")]
fn detect_windows_toolhelp_processes() -> Vec<ScreenShareProcess> {
    use windows::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
        TH32CS_SNAPPROCESS,
    };

    let snapshot = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0).ok() };
    let Some(snapshot) = snapshot else {
        return Vec::new();
    };
    let _snapshot_guard = WindowsSnapshotGuard(snapshot);
    let mut entry = PROCESSENTRY32W {
        dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32,
        ..Default::default()
    };

    if unsafe { Process32FirstW(snapshot, &mut entry) }.is_err() {
        return Vec::new();
    }

    let mut processes = Vec::new();
    loop {
        let name = windows_process_entry_name(&entry);
        if !name.is_empty() {
            processes.push(ScreenShareProcess {
                name,
                pid: Some(entry.th32ProcessID),
                window_title: None,
            });
        }

        if unsafe { Process32NextW(snapshot, &mut entry) }.is_err() {
            break;
        }
    }

    processes
}

#[cfg(target_os = "windows")]
fn windows_process_entry_name(
    entry: &windows::Win32::System::Diagnostics::ToolHelp::PROCESSENTRY32W,
) -> String {
    let end = entry
        .szExeFile
        .iter()
        .position(|unit| *unit == 0)
        .unwrap_or(entry.szExeFile.len());
    String::from_utf16_lossy(&entry.szExeFile[..end])
        .trim()
        .to_string()
}

#[cfg(target_os = "windows")]
fn read_windows_window_title(hwnd: windows::Win32::Foundation::HWND) -> String {
    use windows::Win32::UI::WindowsAndMessaging::{GetWindowTextLengthW, GetWindowTextW};

    let text_length = unsafe { GetWindowTextLengthW(hwnd) };
    if text_length <= 0 {
        return String::new();
    }

    let mut buffer = vec![0_u16; text_length as usize + 1];
    let length = unsafe { GetWindowTextW(hwnd, &mut buffer) };
    if length <= 0 {
        return String::new();
    }

    String::from_utf16_lossy(&buffer[..length as usize])
        .trim()
        .to_string()
}

#[cfg(target_os = "windows")]
fn read_windows_process_name(process_id: u32) -> Option<String> {
    use windows::core::PWSTR;
    use windows::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
        PROCESS_QUERY_LIMITED_INFORMATION,
    };

    let handle = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, process_id).ok()? };
    let _handle_guard = WindowsHandleGuard(handle);
    let mut buffer = vec![0_u16; 32_768];
    let mut length = buffer.len() as u32;
    unsafe {
        QueryFullProcessImageNameW(
            handle,
            PROCESS_NAME_WIN32,
            PWSTR(buffer.as_mut_ptr()),
            &mut length,
        )
        .ok()?;
    }

    let path = String::from_utf16_lossy(&buffer[..length as usize]);
    Some(
        std::path::Path::new(&path)
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or(path.as_str())
            .to_string(),
    )
}

#[cfg(target_os = "windows")]
struct WindowsHandleGuard(windows::Win32::Foundation::HANDLE);

#[cfg(target_os = "windows")]
impl Drop for WindowsHandleGuard {
    fn drop(&mut self) {
        let _ = unsafe { windows::Win32::Foundation::CloseHandle(self.0) };
    }
}

#[cfg(target_os = "windows")]
struct WindowsSnapshotGuard(windows::Win32::Foundation::HANDLE);

#[cfg(target_os = "windows")]
impl Drop for WindowsSnapshotGuard {
    fn drop(&mut self) {
        let _ = unsafe { windows::Win32::Foundation::CloseHandle(self.0) };
    }
}

#[cfg(target_os = "macos")]
fn cf_value<T>(dictionary: &objc2_core_foundation::CFDictionary, key: &str) -> Option<*const T> {
    unsafe {
        let key = objc2_core_foundation::CFString::from_str(key);
        let value =
            dictionary.value((key.as_ref() as *const objc2_core_foundation::CFString).cast());
        if value.is_null() {
            None
        } else {
            Some(value as *const T)
        }
    }
}

#[cfg(target_os = "macos")]
fn cf_string(dictionary: &objc2_core_foundation::CFDictionary, key: &str) -> Option<String> {
    let value = cf_value::<objc2_core_foundation::CFString>(dictionary, key)?;
    Some(unsafe { (*value).to_string() })
}

#[cfg(target_os = "macos")]
fn cf_number_i32(dictionary: &objc2_core_foundation::CFDictionary, key: &str) -> Option<i32> {
    let value = cf_value::<objc2_core_foundation::CFNumber>(dictionary, key)?;
    let mut output = 0_i32;
    let ok = unsafe {
        (*value).value(
            objc2_core_foundation::CFNumberType::IntType,
            (&mut output as *mut i32).cast(),
        )
    };
    ok.then_some(output)
}

pub fn native_privacy_shield_thread_start_error_message(error: impl std::fmt::Display) -> String {
    format!("{NATIVE_PRIVACY_SHIELD_THREAD_START_FAILED_MARKER} {error}")
}

pub fn native_privacy_shield_share_risk_is_active() -> bool {
    NATIVE_PRIVACY_SHIELD_SHARE_RISK_ACTIVE.load(Ordering::Relaxed)
}

fn apply_native_privacy_shield_window_update(
    app: &tauri::AppHandle,
    decision: NativePrivacyShieldDecision,
    restore_after_share_risk: bool,
) {
    match decision {
        NativePrivacyShieldDecision::Allow => {
            let status = crate::overlay::protect_overlay_window(app, true);
            if matches!(
                native_privacy_shield_decision_for_overlay_protection(&status),
                NativePrivacyShieldDecision::Hide { .. }
            ) {
                hide_app_windows_for_native_privacy_shield(app);
            } else if restore_after_share_risk {
                crate::overlay::restore_companion_windows_after_share_risk_cleared(app);
            } else {
                crate::overlay::restore_companion_windows_after_clear_privacy_check(app);
            }
        }
        NativePrivacyShieldDecision::Hide { .. } => {
            std::hint::black_box(NATIVE_PRIVACY_SHIELD_REFRESHES_CAPTURE_BEFORE_SHARE_HIDE_MARKER);
            crate::overlay::pause_companion_window_restore_after_privacy_denial();
            let _ = crate::overlay::protect_overlay_window(app, true);
            hide_app_windows_for_native_privacy_shield(app);
        }
    }
}

fn hide_app_windows_for_native_privacy_shield(app: &tauri::AppHandle) {
    let _ = crate::overlay::set_overlay_window_visible(app, false, true);
    let _ = crate::overlay::set_companion_windows_visible(app, false, true);
}

fn screen_share_status_for_processes(processes: Vec<ScreenShareProcess>) -> ScreenShareStatus {
    let matched_processes = processes
        .into_iter()
        .filter(|process| {
            is_watched_screen_share_process(process)
                || (is_screen_share_window_title_host_process(&process.name)
                    && is_watched_screen_share_window_title(process.window_title.as_deref()))
                || is_strong_screen_share_window_title(process.window_title.as_deref())
        })
        .collect::<Vec<_>>();

    ScreenShareStatus {
        active: !matched_processes.is_empty(),
        message: if matched_processes.is_empty() {
            None
        } else {
            Some("Known screen-sharing or recording process is running.".to_string())
        },
        matched_processes,
    }
}

fn is_watched_screen_share_process(process: &ScreenShareProcess) -> bool {
    let normalized = normalize_process_name(&process.name);
    if is_title_only_screen_share_process(&normalized) {
        return false;
    }

    if is_macos_core_parsec_system_process(process, &normalized) {
        return false;
    }

    WATCHED_SCREEN_SHARE_PROCESSES
        .iter()
        .any(|candidate| process_name_matches_candidate(&normalized, candidate))
}

fn is_macos_core_parsec_system_process(process: &ScreenShareProcess, normalized: &str) -> bool {
    matches!(normalized, "parsecd" | "parsec-fbf")
        && process
            .name
            .starts_with("/System/Library/PrivateFrameworks/CoreParsec.framework/")
}

fn is_screen_share_window_title_host_process(name: &str) -> bool {
    let normalized = normalize_process_name(name);
    SCREEN_SHARE_TITLE_HOST_PROCESSES
        .iter()
        .chain(TITLE_ONLY_SCREEN_SHARE_PROCESSES.iter())
        .any(|candidate| process_name_matches_candidate(&normalized, candidate))
}

fn is_title_only_screen_share_process(normalized: &str) -> bool {
    TITLE_ONLY_SCREEN_SHARE_PROCESSES
        .iter()
        .any(|candidate| process_name_matches_candidate(normalized, candidate))
}

fn is_watched_screen_share_window_title(title: Option<&str>) -> bool {
    let Some(title) = title else {
        return false;
    };
    let normalized = normalize_screen_share_window_title_for_match(title);
    !normalized.is_empty()
        && normalized != "n/a"
        && WATCHED_SCREEN_SHARE_TITLES.iter().any(|candidate| {
            let candidate = normalize_screen_share_window_title_for_match(candidate);
            !candidate.is_empty() && normalized.contains(&candidate)
        })
}

fn is_strong_screen_share_window_title(title: Option<&str>) -> bool {
    std::hint::black_box(STRONG_WINDOW_TITLE_ANY_APP_MARKER);

    let Some(title) = title else {
        return false;
    };
    let normalized = normalize_screen_share_window_title_for_match(title);
    if normalized.is_empty() || normalized == "n/a" {
        return false;
    }

    let active_share_titles = [
        BROWSER_YOU_ARE_SHARING_TITLE,
        BROWSER_YOURE_SHARING_TITLE,
        BROWSER_SHARING_YOUR_SCREEN_TITLE,
        BROWSER_SHARING_YOUR_ENTIRE_SCREEN_TITLE,
        BROWSER_SHARING_ENTIRE_SCREEN_TITLE,
        BROWSER_SHARING_THIS_TAB_TITLE,
        BROWSER_SHARING_A_BROWSER_TAB_TITLE,
        BROWSER_SHARING_A_CHROME_TAB_TITLE,
        BROWSER_SHARING_A_WINDOW_TITLE,
        BROWSER_SHARING_AN_APPLICATION_WINDOW_TITLE,
        BROWSER_THIS_TAB_IS_BEING_SHARED_TITLE,
        BROWSER_THIS_WINDOW_IS_BEING_SHARED_TITLE,
        BROWSER_APPLICATION_WINDOW_IS_BEING_SHARED_TITLE,
        BROWSER_THIS_SCREEN_IS_BEING_SHARED_TITLE,
        BROWSER_SCREEN_IS_BEING_SHARED_TITLE,
        BROWSER_STOP_SHARING_TITLE,
        BROWSER_YOU_ARE_PRESENTING_TITLE,
        BROWSER_YOURE_PRESENTING_TITLE,
        BROWSER_PRESENTING_YOUR_SCREEN_TITLE,
        BROWSER_PRESENTING_THIS_TAB_TITLE,
        BROWSER_PRESENTING_A_WINDOW_TITLE,
        BROWSER_PRESENTING_TO_EVERYONE_TITLE,
        BROWSER_STOP_PRESENTING_TITLE,
        BROWSER_SCREEN_RECORDING_TITLE,
        BROWSER_RECORDING_YOUR_SCREEN_TITLE,
        BROWSER_RECORDING_SCREEN_TITLE,
        BROWSER_SCREEN_IS_BEING_RECORDED_TITLE,
        BROWSER_BEING_RECORDED_TITLE,
    ];

    active_share_titles
        .iter()
        .any(|candidate| strong_window_title_matches_candidate(&normalized, candidate))
        || [
            "google meet -",
            "microsoft teams -",
            "teams meeting",
            "zoom meeting",
            "webex meeting",
        ]
        .iter()
        .any(|candidate| normalized.starts_with(candidate))
}

fn strong_window_title_matches_candidate(normalized: &str, candidate: &str) -> bool {
    let candidate = normalize_screen_share_window_title_for_match(candidate);
    if candidate.is_empty() {
        return false;
    }

    if normalized == candidate {
        return true;
    }

    normalized.strip_prefix(&candidate).is_some_and(|suffix| {
        matches!(
            suffix.trim_start().as_bytes().first(),
            Some(b'-' | b':' | b'|' | b'(')
        )
    })
}

fn normalize_screen_share_window_title_for_match(value: &str) -> String {
    let mut normalized = String::new();
    let mut previous_was_whitespace = false;

    for ch in value.trim().to_lowercase().chars() {
        let mapped = match ch {
            '\u{2018}' | '\u{2019}' | '\u{201b}' | '\u{02bc}' | '\u{ff07}' => '\'',
            '\u{201c}' | '\u{201d}' | '\u{201f}' | '\u{ff02}' => '"',
            '\u{2010}' | '\u{2011}' | '\u{2012}' | '\u{2013}' | '\u{2014}' | '\u{2212}'
            | '\u{fe58}' | '\u{fe63}' | '\u{ff0d}' => '-',
            _ if ch.is_whitespace() => ' ',
            _ => ch,
        };

        if mapped == ' ' {
            if !previous_was_whitespace && !normalized.is_empty() {
                normalized.push(mapped);
            }
            previous_was_whitespace = true;
        } else {
            normalized.push(mapped);
            previous_was_whitespace = false;
        }
    }

    normalized
}

fn process_name_matches_candidate(normalized: &str, candidate: &str) -> bool {
    process_name_matches_candidate_literal(normalized, candidate)
        || candidate
            .strip_suffix(".exe")
            .is_some_and(|candidate_stem| {
                process_name_matches_candidate_literal(normalized, candidate_stem)
            })
}

fn process_name_matches_candidate_literal(normalized: &str, candidate: &str) -> bool {
    normalized == candidate
        || normalized.strip_prefix(candidate).is_some_and(|suffix| {
            matches!(
                suffix.as_bytes().first(),
                Some(b' ' | b'(' | b'-' | b'.' | b'_')
            )
        })
}

fn normalize_process_name(name: &str) -> String {
    let trimmed = name.trim();
    trimmed
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or(trimmed)
        .to_ascii_lowercase()
}

#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
fn parse_tasklist_csv(output: &str) -> Vec<ScreenShareProcess> {
    output
        .lines()
        .filter_map(|line| {
            let columns = parse_csv_line(line);
            let name = columns.first()?.trim().to_string();
            if name.is_empty() {
                return None;
            }

            let pid = columns
                .get(1)
                .and_then(|value| value.trim().parse::<u32>().ok());
            let window_title = columns
                .get(8)
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty() && value != "N/A");
            Some(ScreenShareProcess {
                name,
                pid,
                window_title,
            })
        })
        .collect()
}

fn parse_unix_process_list(output: &str) -> Vec<ScreenShareProcess> {
    output
        .lines()
        .filter_map(|line| {
            let (pid, name) = line.trim().split_once(char::is_whitespace)?;
            let name = name.trim().to_string();
            if name.is_empty() {
                return None;
            }

            Some(ScreenShareProcess {
                name,
                pid: pid.trim().parse::<u32>().ok(),
                window_title: None,
            })
        })
        .collect()
}

fn parse_macos_window_title_rows(output: &str) -> Vec<ScreenShareProcess> {
    output
        .lines()
        .filter_map(|line| {
            let mut columns = line.splitn(3, '\t');
            let pid = columns
                .next()
                .and_then(|value| value.trim().parse::<u32>().ok());
            let name = columns.next()?.trim().to_string();
            let window_title = columns.next()?.trim().to_string();

            if name.is_empty() || window_title.is_empty() {
                return None;
            }

            Some(ScreenShareProcess {
                name,
                pid,
                window_title: Some(window_title),
            })
        })
        .collect()
}

#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
fn parse_csv_line(line: &str) -> Vec<String> {
    let mut values = Vec::new();
    let mut current = String::new();
    let mut quoted = false;
    let mut chars = line.chars().peekable();

    while let Some(ch) = chars.next() {
        match ch {
            '"' if quoted && chars.peek() == Some(&'"') => {
                current.push('"');
                let _ = chars.next();
            }
            '"' => quoted = !quoted,
            ',' if !quoted => {
                values.push(current.trim().to_string());
                current.clear();
            }
            _ => current.push(ch),
        }
    }

    values.push(current.trim().to_string());
    values
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_known_screen_share_processes_from_tasklist_output() {
        let processes = parse_tasklist_csv(
            "\"zoom.exe\",\"4242\",\"Console\",\"1\",\"118,000 K\"\n\"notepad.exe\",\"7\",\"Console\",\"1\",\"8,000 K\"",
        );

        let status = screen_share_status_for_processes(processes);

        assert!(status.active);
        assert_eq!(
            status.matched_processes,
            vec![ScreenShareProcess {
                name: "zoom.exe".to_string(),
                pid: Some(4242),
                window_title: None,
            }]
        );
    }

    #[test]
    fn detects_windows_meeting_titles_from_webview_and_pwa_hosts() {
        let processes = parse_tasklist_csv(
            "\"msedgewebview2.exe\",\"222\",\"Console\",\"1\",\"120,000 K\",\"Running\",\"DESKTOP\\\\me\",\"0:01:02\",\"Microsoft Teams - Interview\"\n\"ApplicationFrameHost.exe\",\"333\",\"Console\",\"1\",\"90,000 K\",\"Running\",\"DESKTOP\\\\me\",\"0:00:33\",\"Google Meet - Candidate Screen\"\n\"chrome_proxy.exe\",\"444\",\"Console\",\"1\",\"55,000 K\",\"Running\",\"DESKTOP\\\\me\",\"0:00:17\",\"HackerRank Interview - Google Meet\"\n\"RuntimeBroker.exe\",\"555\",\"Console\",\"1\",\"10,000 K\",\"Running\",\"DESKTOP\\\\me\",\"0:00:01\",\"Settings\"",
        );

        let status = screen_share_status_for_processes(processes);

        assert!(status.active);
        assert_eq!(
            status
                .matched_processes
                .iter()
                .map(|process| (process.name.as_str(), process.window_title.as_deref()))
                .collect::<Vec<_>>(),
            vec![
                ("msedgewebview2.exe", Some("Microsoft Teams - Interview")),
                (
                    "ApplicationFrameHost.exe",
                    Some("Google Meet - Candidate Screen")
                ),
                (
                    "chrome_proxy.exe",
                    Some("HackerRank Interview - Google Meet")
                )
            ]
        );
    }

    #[test]
    fn detects_edge_installed_app_meeting_titles_from_pwa_host() {
        let processes = parse_tasklist_csv(
            "\"msedge_proxy.exe\",\"555\",\"Console\",\"1\",\"64,000 K\",\"Running\",\"DESKTOP\\\\me\",\"0:00:21\",\"Google Meet - Candidate Screen\"",
        );

        let status = screen_share_status_for_processes(processes);

        assert!(status.active);
        assert_eq!(
            status.matched_processes,
            vec![ScreenShareProcess {
                name: "msedge_proxy.exe".to_string(),
                pid: Some(555),
                window_title: Some("Google Meet - Candidate Screen".to_string()),
            }]
        );
    }

    #[test]
    fn detects_meeting_titles_from_alternate_chromium_pwa_hosts() {
        let processes = parse_tasklist_csv(
            "\"brave_proxy.exe\",\"601\",\"Console\",\"1\",\"64,000 K\",\"Running\",\"DESKTOP\\\\me\",\"0:00:21\",\"Google Meet - Candidate Screen\"\n\"opera_proxy.exe\",\"602\",\"Console\",\"1\",\"64,000 K\",\"Running\",\"DESKTOP\\\\me\",\"0:00:22\",\"Microsoft Teams - Interview\"\n\"vivaldi_proxy.exe\",\"603\",\"Console\",\"1\",\"64,000 K\",\"Running\",\"DESKTOP\\\\me\",\"0:00:23\",\"teams.microsoft.com - Standup\"\n\"RuntimeBroker.exe\",\"604\",\"Console\",\"1\",\"10,000 K\",\"Running\",\"DESKTOP\\\\me\",\"0:00:01\",\"Settings\"",
        );

        let status = screen_share_status_for_processes(processes);

        assert!(status.active);
        assert_eq!(
            status
                .matched_processes
                .iter()
                .map(|process| (process.name.as_str(), process.window_title.as_deref()))
                .collect::<Vec<_>>(),
            vec![
                ("brave_proxy.exe", Some("Google Meet - Candidate Screen")),
                ("opera_proxy.exe", Some("Microsoft Teams - Interview")),
                ("vivaldi_proxy.exe", Some("teams.microsoft.com - Standup"))
            ]
        );
    }

    #[test]
    fn detects_additional_web_meeting_and_recorder_titles_from_pwa_hosts() {
        let processes = parse_tasklist_csv(
            "\"msedge_proxy.exe\",\"611\",\"Console\",\"1\",\"64,000 K\",\"Running\",\"DESKTOP\\\\me\",\"0:00:21\",\"Whereby - Candidate Interview\"\n\"chrome_proxy.exe\",\"612\",\"Console\",\"1\",\"64,000 K\",\"Running\",\"DESKTOP\\\\me\",\"0:00:22\",\"Riverside Recording Studio\"\n\"brave_proxy.exe\",\"613\",\"Console\",\"1\",\"64,000 K\",\"Running\",\"DESKTOP\\\\me\",\"0:00:23\",\"StreamYard - Live Studio\"\n\"opera_proxy.exe\",\"614\",\"Console\",\"1\",\"64,000 K\",\"Running\",\"DESKTOP\\\\me\",\"0:00:24\",\"Livestorm Webinar Room\"\n\"vivaldi_proxy.exe\",\"615\",\"Console\",\"1\",\"64,000 K\",\"Running\",\"DESKTOP\\\\me\",\"0:00:25\",\"BigBlueButton - Interview Room\"\n\"msedgewebview2.exe\",\"616\",\"Console\",\"1\",\"64,000 K\",\"Running\",\"DESKTOP\\\\me\",\"0:00:26\",\"Tella Screen Recording\"\n\"RuntimeBroker.exe\",\"617\",\"Console\",\"1\",\"10,000 K\",\"Running\",\"DESKTOP\\\\me\",\"0:00:01\",\"Settings\"",
        );

        let status = screen_share_status_for_processes(processes);

        assert!(status.active);
        assert_eq!(
            status
                .matched_processes
                .iter()
                .map(|process| (process.name.as_str(), process.window_title.as_deref()))
                .collect::<Vec<_>>(),
            vec![
                ("msedge_proxy.exe", Some("Whereby - Candidate Interview")),
                ("chrome_proxy.exe", Some("Riverside Recording Studio")),
                ("brave_proxy.exe", Some("StreamYard - Live Studio")),
                ("opera_proxy.exe", Some("Livestorm Webinar Room")),
                ("vivaldi_proxy.exe", Some("BigBlueButton - Interview Room")),
                ("msedgewebview2.exe", Some("Tella Screen Recording"))
            ]
        );
    }

    #[test]
    fn detects_zoom_and_slack_web_origins_from_pwa_hosts() {
        let processes = parse_tasklist_csv(
            "\"chrome_proxy.exe\",\"621\",\"Console\",\"1\",\"64,000 K\",\"Running\",\"DESKTOP\\\\me\",\"0:00:21\",\"join.zoom.us/wc/123456789\"\n\"msedge_proxy.exe\",\"622\",\"Console\",\"1\",\"64,000 K\",\"Running\",\"DESKTOP\\\\me\",\"0:00:22\",\"app.slack.com/client/T123/C456\"\n\"RuntimeBroker.exe\",\"623\",\"Console\",\"1\",\"10,000 K\",\"Running\",\"DESKTOP\\\\me\",\"0:00:01\",\"Settings\"",
        );

        let status = screen_share_status_for_processes(processes);

        assert!(status.active);
        assert_eq!(
            status
                .matched_processes
                .iter()
                .map(|process| (process.name.as_str(), process.window_title.as_deref()))
                .collect::<Vec<_>>(),
            vec![
                ("chrome_proxy.exe", Some("join.zoom.us/wc/123456789")),
                ("msedge_proxy.exe", Some("app.slack.com/client/T123/C456"))
            ]
        );
    }

    #[test]
    fn recognizes_zoom_and_slack_web_origin_titles() {
        assert!(is_watched_screen_share_window_title(Some(
            "join.zoom.us/wc/123456789"
        )));
        assert!(is_watched_screen_share_window_title(Some(
            "app.slack.com/client/T123/C456"
        )));
    }

    #[test]
    fn detects_consumer_teams_and_web_huddle_origins_from_webview_hosts() {
        let processes = parse_tasklist_csv(
            "\"msedgewebview2.exe\",\"631\",\"Console\",\"1\",\"64,000 K\",\"Running\",\"DESKTOP\\\\me\",\"0:00:21\",\"teams.live.com/v2/meet/123\"\n\"ApplicationFrameHost.exe\",\"632\",\"Console\",\"1\",\"64,000 K\",\"Running\",\"DESKTOP\\\\me\",\"0:00:22\",\"teams.cloud.microsoft/meet/456\"\n\"msedge_proxy.exe\",\"633\",\"Console\",\"1\",\"64,000 K\",\"Running\",\"DESKTOP\\\\me\",\"0:00:23\",\"discord.com/channels/123/456\"\n\"chrome_proxy.exe\",\"634\",\"Console\",\"1\",\"64,000 K\",\"Running\",\"DESKTOP\\\\me\",\"0:00:24\",\"web.whatsapp.com - Video call\"\n\"RuntimeBroker.exe\",\"635\",\"Console\",\"1\",\"10,000 K\",\"Running\",\"DESKTOP\\\\me\",\"0:00:01\",\"Settings\"",
        );

        let status = screen_share_status_for_processes(processes);

        assert!(status.active);
        assert_eq!(
            status
                .matched_processes
                .iter()
                .map(|process| (process.name.as_str(), process.window_title.as_deref()))
                .collect::<Vec<_>>(),
            vec![
                ("msedgewebview2.exe", Some("teams.live.com/v2/meet/123")),
                (
                    "ApplicationFrameHost.exe",
                    Some("teams.cloud.microsoft/meet/456")
                ),
                ("msedge_proxy.exe", Some("discord.com/channels/123/456")),
                ("chrome_proxy.exe", Some("web.whatsapp.com - Video call"))
            ]
        );
    }

    #[test]
    fn recognizes_consumer_teams_and_web_huddle_origin_titles() {
        assert!(is_watched_screen_share_window_title(Some(
            "teams.live.com/v2/meet/123"
        )));
        assert!(is_watched_screen_share_window_title(Some(
            "teams.cloud.microsoft/meet/456"
        )));
        assert!(is_watched_screen_share_window_title(Some(
            "discord.com/channels/123/456"
        )));
        assert!(is_watched_screen_share_window_title(Some(
            "web.whatsapp.com - Video call"
        )));
    }

    #[test]
    fn detects_additional_browser_meeting_origins_from_pwa_hosts() {
        let processes = parse_tasklist_csv(
            "\"msedge_proxy.exe\",\"641\",\"Console\",\"1\",\"64,000 K\",\"Running\",\"DESKTOP\\\\me\",\"0:00:21\",\"web.webex.com/meet/jane\"\n\"chrome_proxy.exe\",\"642\",\"Console\",\"1\",\"64,000 K\",\"Running\",\"DESKTOP\\\\me\",\"0:00:22\",\"meet.goto.com/123456789\"\n\"brave_proxy.exe\",\"643\",\"Console\",\"1\",\"64,000 K\",\"Running\",\"DESKTOP\\\\me\",\"0:00:23\",\"meet.jit.si/candidate-room\"\n\"msedgewebview2.exe\",\"644\",\"Console\",\"1\",\"64,000 K\",\"Running\",\"DESKTOP\\\\me\",\"0:00:24\",\"app.chime.aws/meetings/abc\"\n\"RuntimeBroker.exe\",\"645\",\"Console\",\"1\",\"10,000 K\",\"Running\",\"DESKTOP\\\\me\",\"0:00:01\",\"Settings\"",
        );

        let status = screen_share_status_for_processes(processes);

        assert!(status.active);
        assert_eq!(
            status
                .matched_processes
                .iter()
                .map(|process| (process.name.as_str(), process.window_title.as_deref()))
                .collect::<Vec<_>>(),
            vec![
                ("msedge_proxy.exe", Some("web.webex.com/meet/jane")),
                ("chrome_proxy.exe", Some("meet.goto.com/123456789")),
                ("brave_proxy.exe", Some("meet.jit.si/candidate-room")),
                ("msedgewebview2.exe", Some("app.chime.aws/meetings/abc"))
            ]
        );
    }

    #[test]
    fn recognizes_additional_browser_meeting_origin_titles() {
        assert!(is_watched_screen_share_window_title(Some(
            "web.webex.com/meet/jane"
        )));
        assert!(is_watched_screen_share_window_title(Some(
            "meet.goto.com/123456789"
        )));
        assert!(is_watched_screen_share_window_title(Some(
            "meet.jit.si/candidate-room"
        )));
        assert!(is_watched_screen_share_window_title(Some(
            "app.chime.aws/meetings/abc"
        )));
    }

    #[test]
    fn detects_web_recorder_and_studio_origins_from_pwa_hosts() {
        let processes = parse_tasklist_csv(
            "\"msedge_proxy.exe\",\"651\",\"Console\",\"1\",\"64,000 K\",\"Running\",\"DESKTOP\\\\me\",\"0:00:21\",\"screenpal.com/record - Screen Recorder\"\n\"chrome_proxy.exe\",\"652\",\"Console\",\"1\",\"64,000 K\",\"Running\",\"DESKTOP\\\\me\",\"0:00:22\",\"veed.io/tools/screen-recorder\"\n\"brave_proxy.exe\",\"653\",\"Console\",\"1\",\"64,000 K\",\"Running\",\"DESKTOP\\\\me\",\"0:00:23\",\"clipchamp.com/record-screen\"\n\"opera_proxy.exe\",\"654\",\"Console\",\"1\",\"64,000 K\",\"Running\",\"DESKTOP\\\\me\",\"0:00:24\",\"vidyard.com/record\"\n\"vivaldi_proxy.exe\",\"655\",\"Console\",\"1\",\"64,000 K\",\"Running\",\"DESKTOP\\\\me\",\"0:00:25\",\"descript.com/record\"\n\"msedgewebview2.exe\",\"656\",\"Console\",\"1\",\"64,000 K\",\"Running\",\"DESKTOP\\\\me\",\"0:00:26\",\"studio.restream.io/live-studio\"\n\"ApplicationFrameHost.exe\",\"657\",\"Console\",\"1\",\"64,000 K\",\"Running\",\"DESKTOP\\\\me\",\"0:00:27\",\"vdo.ninja/?room=candidate\"\n\"RuntimeBroker.exe\",\"658\",\"Console\",\"1\",\"10,000 K\",\"Running\",\"DESKTOP\\\\me\",\"0:00:01\",\"Settings\"",
        );

        let status = screen_share_status_for_processes(processes);

        assert!(status.active);
        assert_eq!(
            status
                .matched_processes
                .iter()
                .map(|process| (process.name.as_str(), process.window_title.as_deref()))
                .collect::<Vec<_>>(),
            vec![
                (
                    "msedge_proxy.exe",
                    Some("screenpal.com/record - Screen Recorder")
                ),
                ("chrome_proxy.exe", Some("veed.io/tools/screen-recorder")),
                ("brave_proxy.exe", Some("clipchamp.com/record-screen")),
                ("opera_proxy.exe", Some("vidyard.com/record")),
                ("vivaldi_proxy.exe", Some("descript.com/record")),
                ("msedgewebview2.exe", Some("studio.restream.io/live-studio")),
                (
                    "ApplicationFrameHost.exe",
                    Some("vdo.ninja/?room=candidate")
                )
            ]
        );
    }

    #[test]
    fn recognizes_web_recorder_and_studio_origin_titles() {
        for title in [
            "screenpal.com/record - Screen Recorder",
            "veed.io/tools/screen-recorder",
            "clipchamp.com/record-screen",
            "vidyard.com/record",
            "descript.com/record",
            "studio.restream.io/live-studio",
            "vdo.ninja/?room=candidate",
        ] {
            assert!(is_watched_screen_share_window_title(Some(title)));
        }
    }

    #[test]
    fn recognizes_expanded_web_meeting_and_capture_origins() {
        for title in [
            "call.google.com/candidate-room",
            "join.skype.com/abc123",
            "daily.co/interview-room",
            "gather.town/app/interview",
            "talky.io/candidate-screen",
            "demio.com/event/webinar",
            "remo.co/e/interview",
            "panopto.com/Panopto/Pages/Recorder.aspx",
            "kaltura.com/capture",
            "Screenity - Screen Recorder",
        ] {
            assert!(is_watched_screen_share_window_title(Some(title)));
        }
    }

    #[test]
    fn detects_browser_sharing_state_titles_from_browser_hosts() {
        let processes = parse_tasklist_csv(
            "\"chrome.exe\",\"661\",\"Console\",\"1\",\"64,000 K\",\"Running\",\"DESKTOP\\\\me\",\"0:00:21\",\"You are sharing your screen\"\n\"msedge.exe\",\"662\",\"Console\",\"1\",\"64,000 K\",\"Running\",\"DESKTOP\\\\me\",\"0:00:22\",\"Stop sharing - Google Meet\"\n\"firefox.exe\",\"663\",\"Console\",\"1\",\"64,000 K\",\"Running\",\"DESKTOP\\\\me\",\"0:00:23\",\"Sharing this tab\"\n\"brave.exe\",\"664\",\"Console\",\"1\",\"64,000 K\",\"Running\",\"DESKTOP\\\\me\",\"0:00:24\",\"This window is being shared\"\n\"RuntimeBroker.exe\",\"665\",\"Console\",\"1\",\"10,000 K\",\"Running\",\"DESKTOP\\\\me\",\"0:00:01\",\"Stop sharing notes\"",
        );

        let status = screen_share_status_for_processes(processes);

        assert!(status.active);
        assert_eq!(
            status
                .matched_processes
                .iter()
                .map(|process| (process.name.as_str(), process.window_title.as_deref()))
                .collect::<Vec<_>>(),
            vec![
                ("chrome.exe", Some("You are sharing your screen")),
                ("msedge.exe", Some("Stop sharing - Google Meet")),
                ("firefox.exe", Some("Sharing this tab")),
                ("brave.exe", Some("This window is being shared"))
            ]
        );
    }

    #[test]
    fn detects_browser_presenting_state_titles_from_browser_hosts() {
        let processes = parse_tasklist_csv(
            "\"chrome.exe\",\"665\",\"Console\",\"1\",\"64,000 K\",\"Running\",\"DESKTOP\\\\me\",\"0:00:21\",\"You are presenting your screen\"\n\"msedge.exe\",\"666\",\"Console\",\"1\",\"64,000 K\",\"Running\",\"DESKTOP\\\\me\",\"0:00:22\",\"Presenting this tab - Google Meet\"\n\"firefox.exe\",\"667\",\"Console\",\"1\",\"64,000 K\",\"Running\",\"DESKTOP\\\\me\",\"0:00:23\",\"Presenting a window\"\n\"notepad.exe\",\"668\",\"Console\",\"1\",\"10,000 K\",\"Running\",\"DESKTOP\\\\me\",\"0:00:01\",\"Presenting notes\"",
        );

        let status = screen_share_status_for_processes(processes);

        assert!(status.active);
        assert_eq!(
            status
                .matched_processes
                .iter()
                .map(|process| (process.name.as_str(), process.window_title.as_deref()))
                .collect::<Vec<_>>(),
            vec![
                ("chrome.exe", Some("You are presenting your screen")),
                ("msedge.exe", Some("Presenting this tab - Google Meet")),
                ("firefox.exe", Some("Presenting a window"))
            ]
        );
    }

    #[test]
    fn detects_expanded_browser_share_state_titles_from_browser_hosts() {
        let processes = parse_tasklist_csv(
            "\"chrome.exe\",\"675\",\"Console\",\"1\",\"64,000 K\",\"Running\",\"DESKTOP\\\\me\",\"0:00:21\",\"Sharing your entire screen\"\n\"msedge.exe\",\"676\",\"Console\",\"1\",\"64,000 K\",\"Running\",\"DESKTOP\\\\me\",\"0:00:22\",\"Sharing a browser tab - Microsoft Teams\"\n\"firefox.exe\",\"677\",\"Console\",\"1\",\"64,000 K\",\"Running\",\"DESKTOP\\\\me\",\"0:00:23\",\"Sharing an application window\"\n\"brave.exe\",\"678\",\"Console\",\"1\",\"64,000 K\",\"Running\",\"DESKTOP\\\\me\",\"0:00:24\",\"Application window is being shared\"\n\"vivaldi.exe\",\"679\",\"Console\",\"1\",\"64,000 K\",\"Running\",\"DESKTOP\\\\me\",\"0:00:25\",\"Stop presenting - Google Meet\"\n\"notepad.exe\",\"680\",\"Console\",\"1\",\"10,000 K\",\"Running\",\"DESKTOP\\\\me\",\"0:00:01\",\"Sharing an application window notes\"",
        );

        let status = screen_share_status_for_processes(processes);

        assert!(status.active);
        assert_eq!(
            status
                .matched_processes
                .iter()
                .map(|process| (process.name.as_str(), process.window_title.as_deref()))
                .collect::<Vec<_>>(),
            vec![
                ("chrome.exe", Some("Sharing your entire screen")),
                (
                    "msedge.exe",
                    Some("Sharing a browser tab - Microsoft Teams")
                ),
                ("firefox.exe", Some("Sharing an application window")),
                ("brave.exe", Some("Application window is being shared")),
                ("vivaldi.exe", Some("Stop presenting - Google Meet"))
            ]
        );
    }

    #[test]
    fn detects_compact_google_meet_and_screen_recording_titles_from_browser_hosts() {
        let processes = parse_tasklist_csv(
            "\"chrome.exe\",\"669\",\"Console\",\"1\",\"64,000 K\",\"Running\",\"DESKTOP\\\\me\",\"0:00:21\",\"Meet - abc-defg-hij\"\n\"msedge.exe\",\"670\",\"Console\",\"1\",\"64,000 K\",\"Running\",\"DESKTOP\\\\me\",\"0:00:22\",\"Screen recording - Loom\"\n\"firefox.exe\",\"671\",\"Console\",\"1\",\"64,000 K\",\"Running\",\"DESKTOP\\\\me\",\"0:00:23\",\"Recording your screen\"\n\"notepad.exe\",\"672\",\"Console\",\"1\",\"10,000 K\",\"Running\",\"DESKTOP\\\\me\",\"0:00:01\",\"Meet - personal notes\"",
        );

        let status = screen_share_status_for_processes(processes);

        assert!(status.active);
        assert_eq!(
            status
                .matched_processes
                .iter()
                .map(|process| (process.name.as_str(), process.window_title.as_deref()))
                .collect::<Vec<_>>(),
            vec![
                ("chrome.exe", Some("Meet - abc-defg-hij")),
                ("msedge.exe", Some("Screen recording - Loom")),
                ("firefox.exe", Some("Recording your screen"))
            ]
        );
    }

    #[test]
    fn recognizes_browser_sharing_state_titles() {
        for title in [
            "You are sharing your screen",
            "You're sharing a window",
            "Sharing your screen",
            "Sharing your entire screen",
            "Sharing entire screen",
            "Sharing this tab",
            "Sharing a browser tab",
            "Sharing a Chrome tab",
            "Sharing a window",
            "Sharing an application window",
            "This tab is being shared",
            "This window is being shared",
            "Application window is being shared",
            "This screen is being shared",
            "Your screen is being shared",
            "Stop sharing - Google Meet",
            "You are presenting your screen",
            "You're presenting a window",
            "Presenting your screen",
            "Presenting this tab",
            "Presenting a window",
            "Presenting to everyone",
            "Stop presenting - Microsoft Teams",
            "Meet - abc-defg-hij",
            "Screen recording - Loom",
            "Recording your screen",
            "Recording screen",
            "Your screen is being recorded",
            "Meeting is being recorded",
        ] {
            assert!(is_watched_screen_share_window_title(Some(title)));
        }
    }

    #[test]
    fn recognizes_browser_sharing_state_titles_with_ui_punctuation_variants() {
        for title in [
            "You\u{2019}re sharing your screen",
            "You\u{2018}re presenting a window",
            "Sharing\u{00a0}this\u{00a0}tab",
            "This\u{202f}tab\u{202f}is\u{202f}being\u{202f}shared",
            "Presenting\u{202f}your\u{202f}screen",
            "Recording\u{2009}your\u{2009}screen",
            "Your\u{2009}screen\u{2009}is\u{2009}being\u{2009}recorded",
            "Meet \u{2013} abc-defg-hij",
        ] {
            assert!(is_watched_screen_share_window_title(Some(title)));
        }

        assert!(!is_watched_screen_share_window_title(Some("Meet notes")));
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn treats_redacted_visible_browser_titles_as_share_risk() {
        assert!(is_watched_screen_share_window_title(Some(
            NATIVE_PRIVACY_SHIELD_MACOS_REDACTED_BROWSER_TITLE_MARKER
        )));
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn treats_unavailable_windows_browser_titles_as_share_risk() {
        let status = screen_share_status_for_processes(vec![ScreenShareProcess {
            name: "chrome.exe".to_string(),
            pid: Some(8201),
            window_title: Some(
                NATIVE_PRIVACY_SHIELD_WINDOWS_UNAVAILABLE_BROWSER_TITLE_MARKER.to_string(),
            ),
        }]);

        assert!(status.active);
        assert_eq!(status.matched_processes.len(), 1);
    }

    #[test]
    fn anchors_webview_markers_for_packaged_privacy_attestation() {
        assert_eq!(
            PACKAGE_PRIVACY_SHIELD_WEBVIEW_MARKERS,
            &[
                EDGE_WEBVIEW_HOST_PROCESS,
                EDGE_PWA_HOST_PROCESS,
                APPLICATION_FRAME_HOST_PROCESS,
                CHROME_PWA_HOST_PROCESS,
                BRAVE_PWA_HOST_PROCESS,
                OPERA_PWA_HOST_PROCESS,
                VIVALDI_PWA_HOST_PROCESS,
                ZEN_BROWSER_PROCESS,
                ZEN_BROWSER_EXE_PROCESS,
                CHROMIUM_BROWSER_PROCESS,
                CHROMIUM_BROWSER_EXE_PROCESS,
                LIBREWOLF_BROWSER_PROCESS,
                LIBREWOLF_BROWSER_EXE_PROCESS,
                WATERFOX_BROWSER_PROCESS,
                WATERFOX_BROWSER_EXE_PROCESS,
                FLOORP_BROWSER_PROCESS,
                FLOORP_BROWSER_EXE_PROCESS,
                DUCKDUCKGO_BROWSER_PROCESS,
                DUCKDUCKGO_BROWSER_EXE_PROCESS,
                MULLVAD_BROWSER_PROCESS,
                MULLVAD_BROWSER_DASH_PROCESS,
                WEBEX_HOST_PROCESS,
                SCREENCONNECT_WINDOWS_CLIENT_PROCESS,
                SCREENCONNECT_CLIENT_PROCESS,
                ZOHO_ASSIST_PROCESS,
                ZOHO_ASSIST_CONNECT_PROCESS,
                TEAMS_WEB_MEETING_ORIGIN,
                TEAMS_CONSUMER_WEB_MEETING_ORIGIN,
                TEAMS_CLOUD_WEB_MEETING_ORIGIN,
                MEET_WEB_MEETING_ORIGIN,
                GOOGLE_MEET_CALL_ORIGIN,
                GOOGLE_MEET_SHORT_TITLE_PREFIX,
                ZOOM_WEB_MEETING_ORIGIN,
                SKYPE_WEB_MEETING_ORIGIN,
                SLACK_WEB_HUDDLE_ORIGIN,
                DISCORD_WEB_HUDDLE_ORIGIN,
                WHATSAPP_WEB_CALL_ORIGIN,
                WEBEX_WEB_MEETING_ORIGIN,
                GOTO_WEB_MEETING_ORIGIN,
                JITSI_WEB_MEETING_ORIGIN,
                AMAZON_CHIME_WEB_MEETING_ORIGIN,
                WHEREBY_WEB_MEETING_ORIGIN,
                DAILY_WEB_MEETING_ORIGIN,
                GATHER_WEB_MEETING_ORIGIN,
                TALKY_WEB_MEETING_ORIGIN,
                DEMIO_WEB_MEETING_ORIGIN,
                REMO_WEB_MEETING_ORIGIN,
                RIVERSIDE_WEB_MEETING_ORIGIN,
                STREAMYARD_WEB_MEETING_ORIGIN,
                LIVESTORM_WEB_MEETING_ORIGIN,
                BIGBLUEBUTTON_MEETING_TITLE,
                TELLA_WEB_RECORDER_ORIGIN,
                SCREENPAL_WEB_RECORDER_ORIGIN,
                VEED_WEB_RECORDER_ORIGIN,
                CLIPCHAMP_WEB_RECORDER_ORIGIN,
                VIDYARD_WEB_RECORDER_ORIGIN,
                DESCRIPT_WEB_RECORDER_ORIGIN,
                RESTREAM_WEB_STUDIO_ORIGIN,
                VDO_NINJA_WEB_CALL_ORIGIN,
                PANOPTO_WEB_CAPTURE_ORIGIN,
                KALTURA_WEB_CAPTURE_ORIGIN,
                SCREENITY_WEB_CAPTURE_TITLE,
                "screenpal.exe",
                "screencast-o-matic",
                "descript.exe",
                "vidyard.exe",
                "clipchamp.exe",
                BROWSER_YOU_ARE_SHARING_TITLE,
                BROWSER_YOURE_SHARING_TITLE,
                BROWSER_SHARING_YOUR_SCREEN_TITLE,
                BROWSER_SHARING_YOUR_ENTIRE_SCREEN_TITLE,
                BROWSER_SHARING_ENTIRE_SCREEN_TITLE,
                BROWSER_SHARING_THIS_TAB_TITLE,
                BROWSER_SHARING_A_BROWSER_TAB_TITLE,
                BROWSER_SHARING_A_CHROME_TAB_TITLE,
                BROWSER_SHARING_A_WINDOW_TITLE,
                BROWSER_SHARING_AN_APPLICATION_WINDOW_TITLE,
                BROWSER_THIS_TAB_IS_BEING_SHARED_TITLE,
                BROWSER_THIS_WINDOW_IS_BEING_SHARED_TITLE,
                BROWSER_APPLICATION_WINDOW_IS_BEING_SHARED_TITLE,
                BROWSER_THIS_SCREEN_IS_BEING_SHARED_TITLE,
                BROWSER_SCREEN_IS_BEING_SHARED_TITLE,
                BROWSER_STOP_SHARING_TITLE,
                BROWSER_YOU_ARE_PRESENTING_TITLE,
                BROWSER_YOURE_PRESENTING_TITLE,
                BROWSER_PRESENTING_YOUR_SCREEN_TITLE,
                BROWSER_PRESENTING_THIS_TAB_TITLE,
                BROWSER_PRESENTING_A_WINDOW_TITLE,
                BROWSER_PRESENTING_TO_EVERYONE_TITLE,
                BROWSER_STOP_PRESENTING_TITLE,
                BROWSER_SCREEN_RECORDING_TITLE,
                BROWSER_RECORDING_YOUR_SCREEN_TITLE,
                BROWSER_RECORDING_SCREEN_TITLE,
                BROWSER_SCREEN_IS_BEING_RECORDED_TITLE,
                BROWSER_BEING_RECORDED_TITLE,
                SCREEN_SHARE_GUARD_COMMAND_TIMEOUT_MARKER,
                WINDOW_TITLE_PUNCTUATION_NORMALIZATION_MARKER,
                STRONG_WINDOW_TITLE_ANY_APP_MARKER,
                MACOS_SCREEN_CAPTURE_UI_PROCESS,
                MACOS_SCREEN_CAPTURE_CLI_PROCESS,
                MACOS_REPLAYD_PROCESS,
                MACOS_SCREEN_CAPTURE_KIT_AGENT_PROCESS,
                MACOS_WINDOW_TITLE_GUARD_MARKER,
                MACOS_WINDOW_TITLE_PERMISSION_FALLBACK_MARKER,
                MACOS_WINDOW_TITLE_TRANSIENT_ROW_MARKER,
                MACOS_WINDOW_TITLE_TIMEOUT_FALLBACK_MARKER,
                #[cfg(target_os = "macos")]
                MACOS_WINDOW_TITLE_SHORT_TIMEOUT_MARKER,
                #[cfg(target_os = "macos")]
                NATIVE_PRIVACY_SHIELD_MACOS_CORE_GRAPHICS_TITLE_GATE_MARKER,
                #[cfg(target_os = "macos")]
                NATIVE_PRIVACY_SHIELD_MACOS_CORE_GRAPHICS_TITLE_FAST_SCAN_MARKER,
                #[cfg(target_os = "macos")]
                NATIVE_PRIVACY_SHIELD_MACOS_REDACTED_BROWSER_TITLE_MARKER,
                #[cfg(target_os = "windows")]
                NATIVE_PRIVACY_SHIELD_WINDOWS_ENUMWINDOWS_TITLE_MARKER,
                #[cfg(target_os = "windows")]
                NATIVE_PRIVACY_SHIELD_WINDOWS_ENUMWINDOWS_FAST_GATE_MARKER,
                #[cfg(target_os = "windows")]
                NATIVE_PRIVACY_SHIELD_WINDOWS_UNAVAILABLE_BROWSER_TITLE_MARKER,
                #[cfg(target_os = "windows")]
                NATIVE_PRIVACY_SHIELD_WINDOWS_TOOLHELP_PROCESS_MARKER
            ]
        );
    }

    #[test]
    fn macos_window_title_guard_permission_denial_is_classified_for_capture_fallback() {
        assert_eq!(
            macos_window_title_guard_fallback_marker(
                "execution error: Not authorized to send Apple events to System Events. (-1743)"
            ),
            Some(MACOS_WINDOW_TITLE_PERMISSION_FALLBACK_MARKER)
        );
        assert_eq!(
            macos_window_title_guard_fallback_marker(
                "System Events got an error: osascript is not allowed assistive access."
            ),
            Some(MACOS_WINDOW_TITLE_PERMISSION_FALLBACK_MARKER)
        );
        assert_eq!(
            macos_window_title_guard_fallback_marker(
                "Operation not permitted while reading accessibility window titles"
            ),
            Some(MACOS_WINDOW_TITLE_PERMISSION_FALLBACK_MARKER)
        );
        assert_eq!(
            macos_window_title_guard_fallback_marker(
                "osascript exited because the script has a syntax error"
            ),
            None
        );
    }

    #[test]
    fn macos_window_title_guard_timeout_is_classified_for_capture_fallback() {
        assert_eq!(
            macos_window_title_guard_fallback_marker(
                "Screen-share guard command timeout failed closed before privacy polling could stall. osascript exceeded 1500ms."
            ),
            Some(MACOS_WINDOW_TITLE_TIMEOUT_FALLBACK_MARKER)
        );
    }

    #[test]
    fn macos_window_title_guard_transient_system_events_error_is_classified_for_capture_fallback() {
        assert_eq!(
            macos_window_title_guard_fallback_marker(
                "System Events got an error: Can't get every process whose background only = false. Invalid index. (-1719)"
            ),
            Some(MACOS_WINDOW_TITLE_TRANSIENT_ROW_MARKER)
        );
    }

    #[test]
    fn ignores_meeting_titles_from_unrelated_windows() {
        let status = screen_share_status_for_processes(vec![
            ScreenShareProcess {
                name: "notepad.exe".to_string(),
                pid: Some(771),
                window_title: Some("Google Meet prep notes".to_string()),
            },
            ScreenShareProcess {
                name: "notes".to_string(),
                pid: Some(773),
                window_title: Some("Microsoft Teams prep notes".to_string()),
            },
            ScreenShareProcess {
                name: "msedgewebview2.exe".to_string(),
                pid: Some(772),
                window_title: Some("N/A".to_string()),
            },
        ]);

        assert!(!status.active);
        assert_eq!(status.matched_processes, Vec::<ScreenShareProcess>::new());
    }

    #[test]
    fn detects_strong_meeting_titles_from_unclassified_visible_apps() {
        let status = screen_share_status_for_processes(vec![
            ScreenShareProcess {
                name: "teams-native".to_string(),
                pid: Some(774),
                window_title: Some("Microsoft Teams - Interview".to_string()),
            },
            ScreenShareProcess {
                name: "meet-window".to_string(),
                pid: Some(775),
                window_title: Some("Google Meet - Candidate Screen".to_string()),
            },
            ScreenShareProcess {
                name: "share-indicator".to_string(),
                pid: Some(776),
                window_title: Some("This window is being shared".to_string()),
            },
        ]);

        assert!(status.active);
        assert_eq!(
            status
                .matched_processes
                .iter()
                .map(|process| (process.name.as_str(), process.window_title.as_deref()))
                .collect::<Vec<_>>(),
            vec![
                ("teams-native", Some("Microsoft Teams - Interview")),
                ("meet-window", Some("Google Meet - Candidate Screen")),
                ("share-indicator", Some("This window is being shared"))
            ]
        );
    }

    #[test]
    fn detects_known_screen_share_processes_from_unix_process_list() {
        let processes = parse_unix_process_list(
            " 4242 /Applications/zoom.us.app/Contents/MacOS/zoom.us\n  77 /Applications/Notes.app/Contents/MacOS/Notes",
        );

        let status = screen_share_status_for_processes(processes);

        assert!(status.active);
        assert_eq!(
            status.matched_processes,
            vec![ScreenShareProcess {
                name: "/Applications/zoom.us.app/Contents/MacOS/zoom.us".to_string(),
                pid: Some(4242),
                window_title: None,
            }]
        );
    }

    #[test]
    fn detects_macos_system_screen_capture_agents_from_unix_process_list() {
        let processes = parse_unix_process_list(
            " 500 /System/Library/CoreServices/screencaptureui\n 501 /usr/sbin/screencapture\n 502 /usr/libexec/replayd\n 503 /System/Library/PrivateFrameworks/ScreenCaptureKit.framework/ScreenCaptureKitAgent\n 504 /Applications/Notes.app/Contents/MacOS/Notes",
        );

        let status = screen_share_status_for_processes(processes);

        assert!(status.active);
        assert_eq!(
            status
                .matched_processes
                .iter()
                .map(|process| process.name.as_str())
                .collect::<Vec<_>>(),
            vec![
                "/System/Library/CoreServices/screencaptureui",
                "/usr/sbin/screencapture",
                "/System/Library/PrivateFrameworks/ScreenCaptureKit.framework/ScreenCaptureKitAgent",
            ]
        );
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn parses_macos_direct_capture_process_rows_from_pgrep() {
        assert!(NATIVE_PRIVACY_SHIELD_MACOS_PGREP_CAPTURE_MARKER.contains("pgrep"));
        assert!(NATIVE_PRIVACY_SHIELD_MACOS_PGREP_FAIL_CLOSED_MARKER.contains("fail-closed"));
        assert!(NATIVE_PRIVACY_SHIELD_MACOS_LIBPROC_CAPTURE_MARKER.contains("libproc"));

        assert_eq!(
            parse_pgrep_process_rows(MACOS_SCREEN_CAPTURE_CLI_PROCESS, "123\n456\n"),
            vec![
                ScreenShareProcess {
                    name: MACOS_SCREEN_CAPTURE_CLI_PROCESS.to_string(),
                    pid: Some(123),
                    window_title: None,
                },
                ScreenShareProcess {
                    name: MACOS_SCREEN_CAPTURE_CLI_PROCESS.to_string(),
                    pid: Some(456),
                    window_title: None,
                },
            ]
        );
        assert!(is_macos_direct_capture_agent_name(
            MACOS_SCREEN_CAPTURE_CLI_PROCESS
        ));
        assert!(!is_macos_direct_capture_agent_name(MACOS_REPLAYD_PROCESS));
    }

    #[test]
    fn ignores_plain_browser_chat_and_idle_macos_capture_daemons() {
        let processes = parse_unix_process_list(
            " 19083 /Applications/WhatsApp.app/Contents/MacOS/WhatsApp\n 77591 /usr/libexec/replayd\n 79211 /System/Volumes/Preboot/Cryptexes/App/System/Applications/Safari.app/Contents/MacOS/Safari\n 79212 /Applications/Notes.app/Contents/MacOS/Notes",
        );

        let status = screen_share_status_for_processes(processes);

        assert!(!status.active);
        assert_eq!(status.matched_processes, Vec::<ScreenShareProcess>::new());
    }

    #[test]
    fn ignores_macos_coreparsec_system_services_without_ignoring_parsec_remote_app() {
        let processes = parse_unix_process_list(
            " 1079 /System/Library/PrivateFrameworks/CoreParsec.framework/parsecd\n 2427 /System/Library/PrivateFrameworks/CoreParsec.framework/parsec-fbf\n 2500 /Applications/Parsec.app/Contents/MacOS/parsecd",
        );

        let status = screen_share_status_for_processes(processes);

        assert!(status.active);
        assert_eq!(
            status.matched_processes,
            vec![ScreenShareProcess {
                name: "/Applications/Parsec.app/Contents/MacOS/parsecd".to_string(),
                pid: Some(2500),
                window_title: None,
            }]
        );
    }

    #[test]
    fn detects_browser_based_meeting_and_recording_processes() {
        let processes = vec![
            ScreenShareProcess {
                name: r"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe".to_string(),
                pid: Some(1001),
                window_title: None,
            },
            ScreenShareProcess {
                name: "/Applications/Microsoft Teams.app/Contents/MacOS/MSTeams".to_string(),
                pid: Some(1002),
                window_title: None,
            },
            ScreenShareProcess {
                name: "/Applications/Safari.app/Contents/MacOS/Safari".to_string(),
                pid: Some(1003),
                window_title: None,
            },
            ScreenShareProcess {
                name: "QuickTime Player".to_string(),
                pid: Some(1004),
                window_title: None,
            },
        ];

        let status = screen_share_status_for_processes(processes);

        assert!(status.active);
        assert_eq!(
            status
                .matched_processes
                .iter()
                .map(|process| process.pid)
                .collect::<Vec<_>>(),
            vec![Some(1002), Some(1004)]
        );
    }

    #[test]
    fn detects_meeting_titles_from_plain_browser_hosts() {
        let processes = vec![
            ScreenShareProcess {
                name: r"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe".to_string(),
                pid: Some(1001),
                window_title: Some("Google Meet - Candidate Screen".to_string()),
            },
            ScreenShareProcess {
                name: "/Applications/Safari.app/Contents/MacOS/Safari".to_string(),
                pid: Some(1003),
                window_title: Some("teams.microsoft.com - Interview".to_string()),
            },
        ];

        let status = screen_share_status_for_processes(processes);

        assert!(status.active);
        assert_eq!(
            status
                .matched_processes
                .iter()
                .map(|process| process.pid)
                .collect::<Vec<_>>(),
            vec![Some(1001), Some(1003)]
        );
    }

    #[test]
    fn detects_meeting_and_share_titles_from_browser_forks() {
        let processes = vec![
            ScreenShareProcess {
                name: "/Applications/Zen.app/Contents/MacOS/zen".to_string(),
                pid: Some(1011),
                window_title: Some("Google Meet - Candidate Screen".to_string()),
            },
            ScreenShareProcess {
                name: r"C:\\Program Files\\Chromium\\Application\\chromium.exe".to_string(),
                pid: Some(1012),
                window_title: Some("teams.microsoft.com - Interview".to_string()),
            },
            ScreenShareProcess {
                name: "LibreWolf.exe".to_string(),
                pid: Some(1013),
                window_title: Some("This screen is being shared".to_string()),
            },
            ScreenShareProcess {
                name: "Waterfox".to_string(),
                pid: Some(1014),
                window_title: Some("Screen recording - Loom".to_string()),
            },
            ScreenShareProcess {
                name: "Floorp".to_string(),
                pid: Some(1015),
                window_title: Some("Presenting this tab - Google Meet".to_string()),
            },
            ScreenShareProcess {
                name: "DuckDuckGo.exe".to_string(),
                pid: Some(1016),
                window_title: Some("This window is being shared".to_string()),
            },
            ScreenShareProcess {
                name: "Mullvad Browser".to_string(),
                pid: Some(1017),
                window_title: Some("meet.google.com/abc-defg-hij".to_string()),
            },
        ];

        let status = screen_share_status_for_processes(processes);

        assert!(status.active);
        assert_eq!(
            status
                .matched_processes
                .iter()
                .map(|process| process.pid)
                .collect::<Vec<_>>(),
            vec![
                Some(1011),
                Some(1012),
                Some(1013),
                Some(1014),
                Some(1015),
                Some(1016),
                Some(1017)
            ]
        );
    }

    #[test]
    fn ignores_idle_browser_forks_without_share_titles() {
        let status = screen_share_status_for_processes(vec![
            ScreenShareProcess {
                name: "/Applications/Zen.app/Contents/MacOS/zen".to_string(),
                pid: Some(1021),
                window_title: Some("Release notes".to_string()),
            },
            ScreenShareProcess {
                name: "Chromium".to_string(),
                pid: Some(1022),
                window_title: None,
            },
            ScreenShareProcess {
                name: "LibreWolf.exe".to_string(),
                pid: Some(1023),
                window_title: Some("N/A".to_string()),
            },
        ]);

        assert!(!status.active);
        assert_eq!(status.matched_processes, Vec::<ScreenShareProcess>::new());
    }

    #[test]
    fn parses_macos_window_title_rows_for_plain_browser_hosts() {
        let processes = parse_macos_window_title_rows(
            "1001\tGoogle Chrome\tGoogle Meet - Candidate Screen\n1002\tSafari\tteams.microsoft.com - Interview\n1003\tNotes\t",
        );

        assert_eq!(
            processes,
            vec![
                ScreenShareProcess {
                    name: "Google Chrome".to_string(),
                    pid: Some(1001),
                    window_title: Some("Google Meet - Candidate Screen".to_string()),
                },
                ScreenShareProcess {
                    name: "Safari".to_string(),
                    pid: Some(1002),
                    window_title: Some("teams.microsoft.com - Interview".to_string()),
                },
            ]
        );

        let status = screen_share_status_for_processes(processes);

        assert!(status.active);
        assert_eq!(
            status
                .matched_processes
                .iter()
                .map(|process| process.pid)
                .collect::<Vec<_>>(),
            vec![Some(1001), Some(1002)]
        );
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn macos_window_title_script_avoids_system_events_rows_name_collision() {
        assert!(MACOS_VISIBLE_WINDOW_TITLE_SCRIPT.contains("windowTitleRows"));
        assert!(!MACOS_VISIBLE_WINDOW_TITLE_SCRIPT.contains("set rows to {}"));
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn macos_window_title_script_skips_transient_system_events_rows() {
        assert!(
            MACOS_VISIBLE_WINDOW_TITLE_SCRIPT.contains("repeat with candidateProcess in processes")
        );
        assert!(MACOS_VISIBLE_WINDOW_TITLE_SCRIPT
            .contains("background only of candidateProcess is false"));
        assert!(MACOS_VISIBLE_WINDOW_TITLE_SCRIPT.contains("end try"));
        assert!(
            !MACOS_VISIBLE_WINDOW_TITLE_SCRIPT.contains("processes whose background only is false")
        );
    }

    #[test]
    fn detects_meeting_browser_and_recorder_helper_process_variants() {
        let processes = vec![
            ScreenShareProcess {
                name: "/Applications/Microsoft Teams.app/Contents/Frameworks/Microsoft Teams Helper (Renderer).app/Contents/MacOS/Microsoft Teams Helper (Renderer)".to_string(),
                pid: Some(1101),
                window_title: None,
            },
            ScreenShareProcess {
                name: "/Applications/Google Chrome.app/Contents/Frameworks/Google Chrome Helper (GPU).app/Contents/MacOS/Google Chrome Helper (GPU)".to_string(),
                pid: Some(1102),
                window_title: None,
            },
            ScreenShareProcess {
                name: "/Applications/OBS.app/Contents/Frameworks/OBS Helper (Renderer).app/Contents/MacOS/OBS Helper (Renderer)".to_string(),
                pid: Some(1103),
                window_title: None,
            },
            ScreenShareProcess {
                name: "Google Meet".to_string(),
                pid: Some(1104),
                window_title: None,
            },
        ];

        let status = screen_share_status_for_processes(processes);

        assert!(status.active);
        assert_eq!(
            status
                .matched_processes
                .iter()
                .map(|process| process.pid)
                .collect::<Vec<_>>(),
            vec![Some(1101), Some(1103), Some(1104)]
        );
    }

    #[test]
    fn detects_remote_support_and_secondary_meeting_processes() {
        let processes = vec![
            ScreenShareProcess {
                name: r"C:\\Program Files\\GoToMeeting\\g2mcomm.exe".to_string(),
                pid: Some(2001),
                window_title: None,
            },
            ScreenShareProcess {
                name: "/Applications/TeamViewer.app/Contents/MacOS/TeamViewer".to_string(),
                pid: Some(2002),
                window_title: None,
            },
            ScreenShareProcess {
                name: "AnyDesk.exe".to_string(),
                pid: Some(2003),
                window_title: None,
            },
            ScreenShareProcess {
                name: "/System/Library/CoreServices/Applications/Screen Sharing.app/Contents/MacOS/Screen Sharing".to_string(),
                pid: Some(2004),
                window_title: None,
            },
            ScreenShareProcess {
                name: "remoting_host.exe".to_string(),
                pid: Some(2005),
                window_title: None,
            },
            ScreenShareProcess {
                name: "/Applications/RustDesk.app/Contents/MacOS/RustDesk".to_string(),
                pid: Some(2006),
                window_title: None,
            },
        ];

        let status = screen_share_status_for_processes(processes);

        assert!(status.active);
        assert_eq!(
            status
                .matched_processes
                .iter()
                .map(|process| process.pid)
                .collect::<Vec<_>>(),
            vec![
                Some(2001),
                Some(2002),
                Some(2003),
                Some(2004),
                Some(2005),
                Some(2006)
            ]
        );
    }

    #[test]
    fn detects_webex_and_screenconnect_screen_share_variants() {
        let processes = vec![
            ScreenShareProcess {
                name: r"C:\\Program Files\\Webex\\WebexHost.exe".to_string(),
                pid: Some(2501),
                window_title: None,
            },
            ScreenShareProcess {
                name: "ScreenConnect.WindowsClient.exe".to_string(),
                pid: Some(2502),
                window_title: None,
            },
            ScreenShareProcess {
                name: "ScreenConnect.Client.exe".to_string(),
                pid: Some(2503),
                window_title: None,
            },
        ];

        let status = screen_share_status_for_processes(processes);

        assert!(status.active);
        assert_eq!(
            status
                .matched_processes
                .iter()
                .map(|process| process.pid)
                .collect::<Vec<_>>(),
            vec![Some(2501), Some(2502), Some(2503)]
        );
    }

    #[test]
    fn detects_remote_support_service_and_assist_variants() {
        let processes = vec![
            ScreenShareProcess {
                name: "TeamViewer_Service.exe".to_string(),
                pid: Some(2601),
                window_title: None,
            },
            ScreenShareProcess {
                name: "ZohoAssist.exe".to_string(),
                pid: Some(2602),
                window_title: None,
            },
            ScreenShareProcess {
                name: "ZA_Connect.exe".to_string(),
                pid: Some(2603),
                window_title: None,
            },
        ];

        let status = screen_share_status_for_processes(processes);

        assert!(status.active);
        assert_eq!(
            status
                .matched_processes
                .iter()
                .map(|process| process.pid)
                .collect::<Vec<_>>(),
            vec![Some(2601), Some(2602), Some(2603)]
        );
    }

    #[test]
    fn detects_exe_detector_candidates_reported_without_extension() {
        let processes = vec![
            ScreenShareProcess {
                name: "ScreenConnect.Client".to_string(),
                pid: Some(2701),
                window_title: None,
            },
            ScreenShareProcess {
                name: "ZohoAssist".to_string(),
                pid: Some(2702),
                window_title: None,
            },
            ScreenShareProcess {
                name: "QuickAssist".to_string(),
                pid: Some(2703),
                window_title: None,
            },
            ScreenShareProcess {
                name: "TeamViewer_Service".to_string(),
                pid: Some(2704),
                window_title: None,
            },
        ];

        let status = screen_share_status_for_processes(processes);

        assert!(status.active);
        assert_eq!(
            status
                .matched_processes
                .iter()
                .map(|process| process.pid)
                .collect::<Vec<_>>(),
            vec![Some(2701), Some(2702), Some(2703), Some(2704)]
        );
    }

    #[test]
    fn detects_additional_meeting_remote_assistance_and_capture_tools() {
        let processes = vec![
            ScreenShareProcess {
                name: r"C:\\Users\\candidate\\AppData\\Local\\RingCentral\\RingCentral.exe"
                    .to_string(),
                pid: Some(3001),
                window_title: None,
            },
            ScreenShareProcess {
                name: "/Applications/Jitsi Meet.app/Contents/MacOS/Jitsi Meet".to_string(),
                pid: Some(3002),
                window_title: None,
            },
            ScreenShareProcess {
                name: "WhatsApp.exe".to_string(),
                pid: Some(3003),
                window_title: Some("web.whatsapp.com - Video call".to_string()),
            },
            ScreenShareProcess {
                name: r"C:\\Windows\\System32\\QuickAssist.exe".to_string(),
                pid: Some(3004),
                window_title: None,
            },
            ScreenShareProcess {
                name: "msra.exe".to_string(),
                pid: Some(3005),
                window_title: None,
            },
            ScreenShareProcess {
                name: "SnippingTool.exe".to_string(),
                pid: Some(3006),
                window_title: None,
            },
            ScreenShareProcess {
                name: "NVIDIA Share.exe".to_string(),
                pid: Some(3007),
                window_title: None,
            },
            ScreenShareProcess {
                name: "/Applications/CleanShot X.app/Contents/MacOS/CleanShot X".to_string(),
                pid: Some(3008),
                window_title: None,
            },
            ScreenShareProcess {
                name: "ScreenPal.exe".to_string(),
                pid: Some(3009),
                window_title: None,
            },
            ScreenShareProcess {
                name: "Screencast-O-Matic".to_string(),
                pid: Some(3010),
                window_title: None,
            },
            ScreenShareProcess {
                name: "/Applications/Descript.app/Contents/MacOS/Descript".to_string(),
                pid: Some(3011),
                window_title: None,
            },
            ScreenShareProcess {
                name: "Vidyard.exe".to_string(),
                pid: Some(3012),
                window_title: None,
            },
            ScreenShareProcess {
                name: "Clipchamp.exe".to_string(),
                pid: Some(3013),
                window_title: None,
            },
        ];

        let status = screen_share_status_for_processes(processes);

        assert!(status.active);
        assert_eq!(
            status
                .matched_processes
                .iter()
                .map(|process| process.pid)
                .collect::<Vec<_>>(),
            vec![
                Some(3001),
                Some(3002),
                Some(3003),
                Some(3004),
                Some(3005),
                Some(3006),
                Some(3007),
                Some(3008),
                Some(3009),
                Some(3010),
                Some(3011),
                Some(3012),
                Some(3013)
            ]
        );
    }

    #[test]
    fn detects_expanded_meeting_capture_and_remote_tool_processes() {
        let processes = vec![
            ScreenShareProcess {
                name: "Zoom Workplace".to_string(),
                pid: Some(4101),
                window_title: None,
            },
            ScreenShareProcess {
                name: "Amazon Chime.exe".to_string(),
                pid: Some(4102),
                window_title: None,
            },
            ScreenShareProcess {
                name: "/Applications/Gather.app/Contents/MacOS/Gather".to_string(),
                pid: Some(4103),
                window_title: None,
            },
            ScreenShareProcess {
                name: "ScreenFlickHelper".to_string(),
                pid: Some(4104),
                window_title: None,
            },
            ScreenShareProcess {
                name: "Panopto Recorder".to_string(),
                pid: Some(4105),
                window_title: None,
            },
            ScreenShareProcess {
                name: "MeshAgent.exe".to_string(),
                pid: Some(4106),
                window_title: None,
            },
            ScreenShareProcess {
                name: "DameWare Mini Remote Control".to_string(),
                pid: Some(4107),
                window_title: None,
            },
            ScreenShareProcess {
                name: "UltraViewer.exe".to_string(),
                pid: Some(4108),
                window_title: None,
            },
        ];

        let status = screen_share_status_for_processes(processes);

        assert!(status.active);
        assert_eq!(
            status
                .matched_processes
                .iter()
                .map(|process| process.pid)
                .collect::<Vec<_>>(),
            vec![
                Some(4101),
                Some(4102),
                Some(4103),
                Some(4104),
                Some(4105),
                Some(4106),
                Some(4107),
                Some(4108)
            ]
        );
    }

    #[test]
    fn ignores_unrelated_processes() {
        let status = screen_share_status_for_processes(vec![ScreenShareProcess {
            name: "notepad.exe".to_string(),
            pid: Some(7),
            window_title: None,
        }]);

        assert!(!status.active);
        assert!(status.matched_processes.is_empty());
    }

    #[test]
    fn native_privacy_shield_hides_when_screen_share_risk_is_active() {
        let status = ScreenShareStatus {
            active: true,
            matched_processes: vec![ScreenShareProcess {
                name: "teams.exe".to_string(),
                pid: Some(42),
                window_title: None,
            }],
            message: Some("Known screen-sharing or recording process is running.".to_string()),
        };

        let decision = native_privacy_shield_decision(Ok(status));

        assert!(matches!(
            decision,
            NativePrivacyShieldDecision::Hide { reason }
                if reason.contains("Known screen-sharing or recording process is running")
        ));
    }

    #[test]
    fn native_privacy_shield_fails_closed_when_detection_errors() {
        let decision = native_privacy_shield_decision(Err(anyhow::anyhow!("ps failed")));

        assert!(matches!(
            decision,
            NativePrivacyShieldDecision::Hide { reason }
                if reason.contains("Screen-share guard failed closed")
                    && reason.contains("ps failed")
        ));
    }

    #[test]
    fn native_privacy_shield_fails_closed_when_guard_is_unsupported() {
        let status = ScreenShareStatus {
            active: false,
            matched_processes: Vec::new(),
            message: Some(
                "Screen-share process guard is only implemented on Windows and macOS in this build."
                    .to_string(),
            ),
        };

        let decision = native_privacy_shield_decision(Ok(status));

        assert!(matches!(
            decision,
            NativePrivacyShieldDecision::Hide { reason }
                if reason.contains("Screen-share guard is not available")
        ));
    }

    #[test]
    fn native_privacy_shield_leaves_windows_alone_when_detection_is_clear() {
        let status = ScreenShareStatus {
            active: false,
            matched_processes: Vec::new(),
            message: None,
        };

        assert_eq!(
            native_privacy_shield_decision(Ok(status)),
            NativePrivacyShieldDecision::Allow
        );
    }

    #[test]
    fn native_privacy_shield_fails_closed_when_capture_exclusion_is_not_enforced() {
        for capture_exclusion in ["failed", "unsupported", "disabled"] {
            let status = crate::overlay::OverlayProtectionStatus {
                always_on_top: true,
                skip_taskbar: true,
                capture_exclusion: capture_exclusion.to_string(),
                click_through: true,
                visible: true,
                message: Some(format!("capture exclusion reported {capture_exclusion}")),
            };

            let decision = native_privacy_shield_decision_for_overlay_protection(&status);

            assert!(matches!(
                decision,
                NativePrivacyShieldDecision::Hide { reason }
                    if reason.contains("Capture exclusion is not enforced")
                        && reason.contains(capture_exclusion)
            ));
        }
    }

    #[test]
    fn native_privacy_shield_polls_quickly_enough_for_new_share_sessions() {
        assert_eq!(NATIVE_PRIVACY_SHIELD_INTERVAL, Duration::from_millis(50));
        assert!(NATIVE_PRIVACY_SHIELD_FAST_POLL_MARKER.contains("50ms"));
        assert!(
            NATIVE_PRIVACY_SHIELD_SKIPS_WINDOW_TITLE_SCAN_MARKER.contains("direct capture polling")
        );
        #[cfg(target_os = "macos")]
        {
            assert_eq!(
                MACOS_WINDOW_TITLE_GUARD_COMMAND_TIMEOUT,
                Duration::from_millis(750)
            );
            assert_eq!(
                MACOS_WINDOW_TITLE_PRIVACY_SCAN_INTERVAL,
                Duration::from_millis(5_000)
            );
            assert_eq!(
                MACOS_CORE_GRAPHICS_TITLE_PRIVACY_SCAN_INTERVAL,
                Duration::from_millis(250)
            );
            assert!(MACOS_WINDOW_TITLE_SHORT_TIMEOUT_MARKER.contains("short timeout"));
            assert!(
                NATIVE_PRIVACY_SHIELD_MACOS_WINDOW_TITLE_BACKGROUND_SCAN_MARKER
                    .contains("background worker")
            );
            assert!(NATIVE_PRIVACY_SHIELD_MACOS_CORE_GRAPHICS_TITLE_GATE_MARKER
                .contains("CoreGraphics"));
            assert!(
                NATIVE_PRIVACY_SHIELD_MACOS_CORE_GRAPHICS_TITLE_FAST_SCAN_MARKER.contains("250ms")
            );
            assert!(
                NATIVE_PRIVACY_SHIELD_MACOS_REDACTED_BROWSER_TITLE_MARKER.contains("unavailable")
            );
        }
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn native_privacy_shield_uses_window_title_risk_latches() {
        MACOS_WINDOW_TITLE_PRIVACY_RISK_ACTIVE.store(false, Ordering::Relaxed);
        MACOS_CORE_GRAPHICS_TITLE_PRIVACY_RISK_ACTIVE.store(false, Ordering::Relaxed);
        assert_eq!(macos_window_title_privacy_risk_status(), None);

        MACOS_WINDOW_TITLE_PRIVACY_RISK_ACTIVE.store(true, Ordering::Relaxed);
        let status = macos_window_title_privacy_risk_status()
            .expect("active title risk should synthesize a fast shield status");

        assert!(status.active);
        assert_eq!(
            status.matched_processes,
            vec![ScreenShareProcess {
                name: "macOS window-title privacy scan".to_string(),
                pid: None,
                window_title: Some("Browser meeting or sharing title detected".to_string()),
            }]
        );

        MACOS_WINDOW_TITLE_PRIVACY_RISK_ACTIVE.store(false, Ordering::Relaxed);
        MACOS_CORE_GRAPHICS_TITLE_PRIVACY_RISK_ACTIVE.store(true, Ordering::Relaxed);
        let status = macos_window_title_privacy_risk_status()
            .expect("active CoreGraphics title risk should synthesize a fast shield status");

        assert!(status.active);
        assert_eq!(
            status.matched_processes,
            vec![ScreenShareProcess {
                name: "macOS CoreGraphics title privacy scan".to_string(),
                pid: None,
                window_title: Some("Browser meeting or sharing title detected".to_string()),
            }]
        );

        MACOS_CORE_GRAPHICS_TITLE_PRIVACY_RISK_ACTIVE.store(false, Ordering::Relaxed);
    }

    #[test]
    fn native_privacy_shield_marks_capture_refresh_before_share_hide() {
        assert!(
            NATIVE_PRIVACY_SHIELD_REFRESHES_CAPTURE_BEFORE_SHARE_HIDE_MARKER
                .contains("refreshes capture exclusion")
        );
        assert!(NATIVE_PRIVACY_SHIELD_MAIN_THREAD_WINDOW_UPDATE_MARKER.contains("main thread"));
        assert!(NATIVE_PRIVACY_SHIELD_SHARE_RISK_LATCH_MARKER.contains("nonblocking"));
    }

    #[test]
    fn native_privacy_shield_thread_start_error_fails_closed() {
        let message = native_privacy_shield_thread_start_error_message("spawn denied");

        assert!(message.contains(NATIVE_PRIVACY_SHIELD_THREAD_START_FAILED_MARKER));
        assert!(message.contains("spawn denied"));
        assert!(message.contains("refusing to run"));
    }

    #[cfg(unix)]
    #[test]
    fn screen_share_guard_command_timeout_fails_closed_on_unix() {
        let error = run_screen_share_guard_command_with_timeout(
            "sh",
            &["-c", "sleep 1"],
            Duration::from_millis(10),
        )
        .expect_err("stalled process detection should time out");

        assert!(error
            .to_string()
            .contains(SCREEN_SHARE_GUARD_COMMAND_TIMEOUT_MARKER));
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn screen_share_guard_command_timeout_fails_closed_on_windows() {
        let error = run_screen_share_guard_command_with_timeout(
            "powershell",
            &["-NoProfile", "-Command", "Start-Sleep -Milliseconds 500"],
            Duration::from_millis(10),
        )
        .expect_err("stalled process detection should time out");

        assert!(error
            .to_string()
            .contains(SCREEN_SHARE_GUARD_COMMAND_TIMEOUT_MARKER));
    }
}
