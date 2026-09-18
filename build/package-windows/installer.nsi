; XAU Trader Windows installer.
;
; Built by build.mjs via:
;   makensis /DVERSION=x.y.z /DSRCDIR=<out/win> /DOUTFILE=<out/XAUTrader-Setup-x.y.z.exe> installer.nsi
;
; Design notes (see project memory project_xau_trader_web_platform's
; self-update section for the full picture):
;  - Per-user install under %LOCALAPPDATA% + RequestExecutionLevel user, so
;    no admin/UAC prompt is needed on the trader's own machine.
;  - Runs identically whether launched normally (first install, shows the
;    three-page wizard below) or with /S (silent — apps/bridge/src/
;    selfUpdate.ts uses this for in-app self-updates). Either way the
;    install section is the same and finishes by relaunching the app, so a
;    silent self-update doesn't leave the user needing to manually restart
;    anything.
;  - Not yet verified end-to-end on real Windows (this dev machine only has
;    Wine as a proxy) — the NSIS mechanics themselves (silent install,
;    overwriting files once the old process has exited, MUI page behavior)
;    are all standard/well-documented, but treat the first real install and
;    the first real self-update as genuine tests, not formalities.

!include "MUI2.nsh"

!ifndef VERSION
  !define VERSION "0.0.0"
!endif
!ifndef SRCDIR
  !error "SRCDIR not defined — pass /DSRCDIR=<path to out/win> on the makensis command line"
!endif
!ifndef OUTFILE
  !define OUTFILE "out\XAUTrader-Setup-${VERSION}.exe"
!endif

Name "XAU Trader"
OutFile "${OUTFILE}"
InstallDir "$LOCALAPPDATA\XAUTrader"
InstallDirRegKey HKCU "Software\XAUTrader" "InstallDir"
RequestExecutionLevel user
Unicode true
SetCompressor /SOLID lzma

!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN "$INSTDIR\xautrader-bridge.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Launch XAU Trader"
; Same source icon as the web dashboard's favicon (apps/web/public/
; favicon.ico) — installer .exe, uninstaller .exe, and the wizard's own
; title-bar icon all pick this up automatically via MUI2.
!define MUI_ICON "icon.ico"
!define MUI_UNICON "icon.ico"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_LANGUAGE "English"

Section "Install"
  SetOutPath "$INSTDIR"
  File /r "${SRCDIR}\*.*"
  ; Shortcuts/Add-Remove-Programs below reference this by its installed
  ; path, not the .nsi-relative one used by MUI_ICON above — the wizard's
  ; own icon is baked into the installer .exe at compile time, but a
  ; shortcut's icon is read at runtime from whatever file it points to.
  File "icon.ico"

  WriteRegStr HKCU "Software\XAUTrader" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "Software\XAUTrader" "Version" "${VERSION}"

  CreateDirectory "$SMPROGRAMS\XAU Trader"
  CreateShortcut "$SMPROGRAMS\XAU Trader\XAU Trader.lnk" "$INSTDIR\xautrader-bridge.exe" "" "$INSTDIR\icon.ico"
  CreateShortcut "$SMPROGRAMS\XAU Trader\Uninstall.lnk" "$INSTDIR\uninstall.exe" "" "$INSTDIR\icon.ico"
  CreateShortcut "$DESKTOP\XAU Trader.lnk" "$INSTDIR\xautrader-bridge.exe" "" "$INSTDIR\icon.ico"

  WriteUninstaller "$INSTDIR\uninstall.exe"

  ; Add/Remove Programs entry (HKCU — matches the per-user, no-admin install).
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\XAUTrader" "DisplayName" "XAU Trader"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\XAUTrader" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\XAUTrader" "UninstallString" "$INSTDIR\uninstall.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\XAUTrader" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\XAUTrader" "DisplayIcon" "$INSTDIR\icon.ico"
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\XAUTrader" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\XAUTrader" "NoRepair" 1

  ; The finish page's own "Launch XAU Trader" checkbox (MUI_FINISHPAGE_RUN,
  ; above) only exists in the interactive wizard UI, which is entirely
  ; skipped under /S — a silent self-update (see selfUpdate.ts) still needs
  ; the app relaunched, so do it explicitly here instead of relying on that
  ; checkbox. Guarded on IfSilent so an interactive install doesn't launch
  ; it twice (once here, once from the finish page).
  IfSilent silent_launch not_silent_launch
  silent_launch:
    Exec '"$INSTDIR\xautrader-bridge.exe"'
  not_silent_launch:
SectionEnd

Section "Uninstall"
  Delete "$INSTDIR\uninstall.exe"
  RMDir /r "$INSTDIR"

  Delete "$SMPROGRAMS\XAU Trader\XAU Trader.lnk"
  Delete "$SMPROGRAMS\XAU Trader\Uninstall.lnk"
  RMDir "$SMPROGRAMS\XAU Trader"
  Delete "$DESKTOP\XAU Trader.lnk"

  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\XAUTrader"
  DeleteRegKey HKCU "Software\XAUTrader"
SectionEnd
