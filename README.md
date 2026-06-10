# Netbird VPN GNOME Shell Extension

A GNOME Shell extension that provides quick access to Netbird VPN status and controls directly from your top panel.

## Features

- **Real-time VPN Status**: Displays current connection state with visual indicators
- **Quick Controls**: Connect and disconnect from the Netbird VPN with one click
- **Profile Management**: Switch between multiple Netbird profiles directly from the menu
- **Login Detection**: Automatically detects when login is required and handles authentication flow
- **Session Expiration Handling**: Configurable actions when session expires (notify, auto-reconnect, or silent)
- **Detailed Connection Info**: 
  - IPv4 and IPv6 addresses
  - Machine FQDN
  - Peer connection breakdown (P2P vs Relayed)
  - DNS server status
  - Service health warnings (management, signal, relay status)
- **Automatic Polling**: Regularly updates status at configurable intervals
- **Browser Customization**: Configure which browser to use for login (useful for private browsing modes)
- **Advanced Settings**: Quick access to the Netbird UI settings panel

## Requirements

- GNOME Shell 50 or later
- Netbird CLI installed at `/usr/bin/netbird`
- Netbird UI installed at `/usr/bin/netbird-ui` (optional, for advanced settings)

## Installation

### Manual Installation

1. Clone or copy this extension to your GNOME Shell extensions directory:
   ```bash
   cp -r netbird-jbilling.redhat.com ~/.local/share/gnome-shell/extensions/netbird@jbilling.redhat.com
   ```

2. Compile the GSettings schema:
   ```bash
   cd ~/.local/share/gnome-shell/extensions/netbird@jbilling.redhat.com
   glib-compile-schemas schemas/
   ```

3. Restart GNOME Shell:
   - On X11: Press `Alt+F2`, type `r`, and press Enter
   - On Wayland: Log out and log back in

4. Enable the extension:
   ```bash
   gnome-extensions enable netbird@jbilling.redhat.com
   ```

## Usage

### Panel Indicator

Once enabled, a VPN icon will appear in your top panel with the following states:

- **Connected** (🔒): VPN is active and connected
- **Disconnected** (🔓): VPN is inactive
- **Needs Login** (🔓): Authentication required
- **Error** (⚠️): Daemon not running or other issue

### Menu Options

Click the panel icon to access:

- **Status Display**: Shows current connection state with detailed information:
  - Connection status (Connected/Disconnected/Needs Login)
  - IPv4 address
  - Peer breakdown showing P2P vs Relayed connections (e.g., "Peers: 5 P2P, 2 Relayed")
  - Machine FQDN (Fully Qualified Domain Name)
  - IPv6 address
  - DNS servers in use
  - Service health warnings if management/signal servers are down or relays unavailable
- **Connect**: Establish VPN connection (handles login if needed)
- **Disconnect**: Terminate VPN connection
- **Refresh**: Manually update status and profile list
- **Profiles** (if multiple profiles exist): Switch between Netbird profiles
  - Active profile is marked with ✓ and disabled
  - Click any other profile to switch to it
  - The profiles section only appears when you have 2 or more profiles
- **Advanced Settings**: Launch Netbird UI configuration
- **Manage Profiles...**: Launch Netbird UI for adding, removing, and deregistering profiles

### Profile Management

If you use multiple Netbird profiles (work, personal, etc.), the extension automatically detects them and shows a Profiles section in the menu:

- Profiles are loaded when the extension starts and when you click Refresh
- The currently active profile is marked with ✓
- Click any non-active profile to switch to it
- After switching, the extension automatically refreshes the connection status
- Single-profile setups won't show the Profiles section (keeps the menu clean)

The **Manage Profiles...** button (always available at the bottom of the menu) launches Netbird UI where you can:
- Create new profiles
- Delete existing profiles
- Deregister profiles from the management server
- Activate/switch profiles

### Understanding Connection Information

**Peer Connection Types:**
- **P2P (Peer-to-Peer)**: Direct encrypted connection between your machine and the peer - faster and lower latency
- **Relayed**: Connection routed through a Netbird relay server - used when direct P2P connection isn't possible due to firewalls/NAT

**Service Health:**
- **Management**: Controls network configuration and access policies
- **Signal**: Coordinates P2P connection establishment
- **Relays**: Fallback servers when P2P connections fail
- Warnings appear if any of these services are unavailable

## Configuration

Access the extension preferences through GNOME Extensions app or:

```bash
gnome-extensions prefs netbird@jbilling.redhat.com
```

### Available Settings

**Browser Command**
- Specify a custom browser for Netbird login authentication
- Useful for opening login pages in private browsing mode
- Examples:
  - `/usr/bin/epiphany --private-instance`
  - `/usr/bin/firefox --private-window`
- Leave empty to use system default

**Refresh Interval**
- How often to poll Netbird status (5-60 seconds)
- Default: 10 seconds
- Lower values provide more responsive updates but use slightly more resources

**Session Expiration Action**
- Controls what happens when the extension detects your Netbird session has expired
- Options:
  - **Do nothing** (default): Silently update the status icon and menu
  - **Show notification**: Display a notification alerting you that the session expired
  - **Show notification with reconnect button**: Display a notification with a button to reconnect immediately
  - **Automatically reconnect**: Automatically initiate login and connection when expiration is detected
- Expiration is detected when the extension transitions from "Connected" to "Needs Login" state

## Troubleshooting

### Extension doesn't appear
- Ensure Netbird is installed: `which netbird`
- Check extension is enabled: `gnome-extensions list --enabled`
- Check logs: `journalctl -f -o cat /usr/bin/gnome-shell`

### "Daemon not running" error
- Start Netbird daemon: `sudo systemctl start netbird`
- Enable at boot: `sudo systemctl enable netbird`

### Login fails to open browser
- Set a custom browser command in preferences
- Ensure your browser supports opening URLs from command line

## License

This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 2 of the License, or (at your option) any later version.

SPDX-License-Identifier: GPL-2.0-or-later

## Credits

Developed by Jonathan Billings

## Links

- [Netbird Official Website](https://netbird.io/)
- [Netbird GitHub](https://github.com/netbirdio/netbird)
