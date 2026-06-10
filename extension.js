/* extension.js
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

import GObject from 'gi://GObject';
import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const Indicator = GObject.registerClass(
class Indicator extends PanelMenu.Button {
    _init(settings) {
        super._init(0.0, _('Netbird VPN Indicator'));

        this._settings = settings;

        this._icon = new St.Icon({
            icon_name: 'network-vpn-symbolic',
            style_class: 'system-status-icon',
        });
        this.add_child(this._icon);

        this._pollSourceId = null;
        this._currentState = 'unknown';
        this._previousState = 'unknown';

        this._buildMenu();
    }

    _buildMenu() {
        this._statusLabel = new PopupMenu.PopupMenuItem(_('Status: Checking...'), {
            reactive: false,
        });
        this.menu.addMenuItem(this._statusLabel);

        this._detailsLabel = new PopupMenu.PopupMenuItem('', {
            reactive: false,
        });
        this.menu.addMenuItem(this._detailsLabel);

        this._fqdnLabel = new PopupMenu.PopupMenuItem('', {
            reactive: false,
        });
        this.menu.addMenuItem(this._fqdnLabel);
        this._fqdnLabel.visible = false;

        this._ipv6Label = new PopupMenu.PopupMenuItem('', {
            reactive: false,
        });
        this.menu.addMenuItem(this._ipv6Label);
        this._ipv6Label.visible = false;

        this._dnsLabel = new PopupMenu.PopupMenuItem('', {
            reactive: false,
        });
        this.menu.addMenuItem(this._dnsLabel);
        this._dnsLabel.visible = false;

        this._healthLabel = new PopupMenu.PopupMenuItem('', {
            reactive: false,
        });
        this.menu.addMenuItem(this._healthLabel);
        this._healthLabel.visible = false;

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        this._connectButton = new PopupMenu.PopupMenuItem(_('Connect'));
        this._connectButton.connect('activate', () => {
            this._executeNetbirdUp();
        });
        this.menu.addMenuItem(this._connectButton);

        this._disconnectButton = new PopupMenu.PopupMenuItem(_('Disconnect'));
        this._disconnectButton.connect('activate', () => {
            this._executeNetbirdDown();
        });
        this.menu.addMenuItem(this._disconnectButton);

        const refreshButton = new PopupMenu.PopupMenuItem(_('Refresh'));
        refreshButton.connect('activate', () => {
            this._updateStatus();
            this._updateProfiles();
        });
        this.menu.addMenuItem(refreshButton);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        this._profilesSection = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(this._profilesSection);
        this._profilesSeparator = new PopupMenu.PopupSeparatorMenuItem();
        this.menu.addMenuItem(this._profilesSeparator);
        this._profilesSeparator.visible = false;

        const settingsButton = new PopupMenu.PopupMenuItem(_('Advanced Settings'));
        settingsButton.connect('activate', () => {
            this._executeNetbirdUI();
        });
        this.menu.addMenuItem(settingsButton);
    }

    async _executeNetbirdCommand(args) {
        try {
            const launcher = new Gio.SubprocessLauncher({
                flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE,
            });

            const browserCommand = this._settings.get_string('browser-command');
            if (browserCommand && browserCommand.trim() !== '') {
                launcher.setenv('BROWSER', browserCommand, true);
            }

            const subprocess = launcher.spawnv(['/usr/bin/netbird', ...args]);

            return new Promise((resolve, reject) => {
                subprocess.communicate_utf8_async(null, null, (proc, res) => {
                    try {
                        const [, stdout, stderr] = proc.communicate_utf8_finish(res);
                        const success = proc.get_successful();

                        resolve({
                            success,
                            stdout: stdout || '',
                            stderr: stderr || '',
                        });
                    } catch (e) {
                        logError(e, 'Failed to finish netbird command');
                        resolve({
                            success: false,
                            stdout: '',
                            stderr: e.message,
                        });
                    }
                });
            });
        } catch (e) {
            logError(e, 'Failed to execute netbird command');
            return {
                success: false,
                stdout: '',
                stderr: e.message,
            };
        }
    }

    _parseStatusJson(stdout) {
        try {
            return JSON.parse(stdout);
        } catch (e) {
            logError(e, 'Failed to parse netbird status JSON');
            return null;
        }
    }

    _parseProfileList(stdout) {
        const profiles = [];
        let activeProfile = null;

        const lines = stdout.trim().split('\n');
        for (const line of lines) {
            if (line.startsWith('Found ') || line.trim() === '') {
                continue;
            }

            const trimmedLine = line.trim();
            const isActive = trimmedLine.startsWith('✓');

            // Remove any leading marker characters (✓ for active, ✗ for inactive) and trim
            const profileName = trimmedLine.replace(/^[✓✗]\s*/, '').trim();

            if (profileName) {
                profiles.push(profileName);
                if (isActive) {
                    activeProfile = profileName;
                }
            }
        }

        return { profiles, activeProfile };
    }

    _getPeerBreakdown(peerDetails) {
        let p2pCount = 0;
        let relayedCount = 0;
        let otherCount = 0;

        peerDetails.forEach(peer => {
            if (peer.status !== 'Connected') {
                return;
            }

            if (peer.connectionType === 'P2P') {
                p2pCount++;
            } else if (peer.connectionType === 'Relayed') {
                relayedCount++;
            } else {
                otherCount++;
            }
        });

        const total = p2pCount + relayedCount + otherCount;
        if (total === 0) {
            return 'Peers: 0';
        }

        const parts = [];
        if (p2pCount > 0) parts.push(`${p2pCount} P2P`);
        if (relayedCount > 0) parts.push(`${relayedCount} Relayed`);
        if (otherCount > 0) parts.push(`${otherCount} Other`);

        return `Peers: ${parts.join(', ')}`;
    }

    _getDnsInfo(dnsServers) {
        const enabledServers = dnsServers.filter(dns => dns.enabled && !dns.error);
        if (enabledServers.length === 0) {
            return null;
        }

        const serverAddresses = enabledServers
            .flatMap(dns => dns.servers || [])
            .filter((value, index, self) => self.indexOf(value) === index); // unique

        if (serverAddresses.length === 0) {
            return null;
        }

        return `DNS: ${serverAddresses.join(', ')}`;
    }

    _getHealthWarnings(status) {
        const warnings = [];

        if (status.management && !status.management.connected) {
            warnings.push('⚠ Management disconnected');
        }

        if (status.signal && !status.signal.connected) {
            warnings.push('⚠ Signal disconnected');
        }

        if (status.relays && status.relays.total > 0) {
            const unavailableRelays = status.relays.total - (status.relays.available || 0);
            if (unavailableRelays > 0) {
                warnings.push(`⚠ ${unavailableRelays} relay(s) unavailable`);
            }
        }

        return warnings.length > 0 ? warnings.join(' | ') : null;
    }

    async _updateStatus() {
        const result = await this._executeNetbirdCommand(['status', '--json']);

        if (!result.stdout.trim()) {
            this._setErrorState('Daemon not running');
            return;
        }

        const status = this._parseStatusJson(result.stdout);
        if (status === null) {
            this._setErrorState('Invalid response from daemon');
            return;
        }

        this._previousState = this._currentState;

        if (status.daemonStatus === 'Connected') {
            this._setConnectedState(status);
        } else if (status.daemonStatus === 'NeedsLogin') {
            this._setNeedsLoginState(status);
        } else {
            this._setDisconnectedState(status);
        }
    }

    async _updateProfiles() {
        const result = await this._executeNetbirdCommand(['profile', 'list']);

        if (!result.success) {
            return;
        }

        const { profiles, activeProfile } = this._parseProfileList(result.stdout);
        this._updateProfilesMenu(profiles, activeProfile);
    }

    async _switchProfile(profileName) {
        Main.notify(_('Netbird'), _(`Switching to profile: ${profileName}...`));
        const result = await this._executeNetbirdCommand(['profile', 'select', profileName]);

        if (result.success) {
            this._updateProfiles();
            this._updateStatus();
        } else {
            Main.notify(_('Netbird Error'), _(`Failed to switch profile: ${result.stderr}`));
        }
    }

    _updateProfilesMenu(profiles, activeProfile) {
        this._profilesSection.removeAll();

        if (profiles.length === 0) {
            this._profilesSeparator.visible = false;
            return;
        }

        this._profilesSeparator.visible = true;

        const profilesLabel = new PopupMenu.PopupMenuItem(_('Profiles'), {
            reactive: false,
        });
        profilesLabel.label.add_style_class_name('popup-subtitle-menu-item');
        this._profilesSection.addMenuItem(profilesLabel);

        // Show profile list only if there are 2+ profiles to switch between
        if (profiles.length > 1) {
            profiles.forEach(profileName => {
                const isActive = profileName === activeProfile;
                const label = isActive ? `✓ ${profileName}` : `   ${profileName}`;
                const item = new PopupMenu.PopupMenuItem(label);

                if (isActive) {
                    item.setSensitive(false);
                } else {
                    item.connect('activate', () => {
                        this._switchProfile(profileName);
                    });
                }

                this._profilesSection.addMenuItem(item);
            });
        }

        // Always show "Manage Profiles..." button when profiles section is visible
        const manageItem = new PopupMenu.PopupMenuItem(_('Manage Profiles...'));
        manageItem.connect('activate', () => {
            this._executeNetbirdProfilesUI();
        });
        this._profilesSection.addMenuItem(manageItem);
    }

    _setConnectedState(status) {
        this._currentState = 'connected';
        this._icon.icon_name = 'network-vpn-symbolic';
        this._statusLabel.label.text = _('Status: Connected');

        // Main details line: IP and peer breakdown
        let details = [];
        if (status.netbirdIp) {
            // Extract just the IP without the CIDR notation
            const ip = status.netbirdIp.split('/')[0];
            details.push(`IP: ${ip}`);
        }
        if (status.peers && status.peers.details) {
            const peerBreakdown = this._getPeerBreakdown(status.peers.details);
            details.push(peerBreakdown);
        }

        this._detailsLabel.label.text = details.join(' | ');
        this._detailsLabel.visible = details.length > 0;

        // FQDN
        if (status.fqdn) {
            this._fqdnLabel.label.text = `FQDN: ${status.fqdn}`;
            this._fqdnLabel.visible = true;
        } else {
            this._fqdnLabel.visible = false;
        }

        // IPv6
        if (status.netbirdIpv6) {
            const ipv6 = status.netbirdIpv6.split('/')[0];
            this._ipv6Label.label.text = `IPv6: ${ipv6}`;
            this._ipv6Label.visible = true;
        } else {
            this._ipv6Label.visible = false;
        }

        // DNS Status
        if (status.dnsServers && status.dnsServers.length > 0) {
            const dnsInfo = this._getDnsInfo(status.dnsServers);
            if (dnsInfo) {
                this._dnsLabel.label.text = dnsInfo;
                this._dnsLabel.visible = true;
            } else {
                this._dnsLabel.visible = false;
            }
        } else {
            this._dnsLabel.visible = false;
        }

        // Service Health
        const healthWarnings = this._getHealthWarnings(status);
        if (healthWarnings) {
            this._healthLabel.label.text = healthWarnings;
            this._healthLabel.visible = true;
        } else {
            this._healthLabel.visible = false;
        }

        this._connectButton.setSensitive(false);
        this._disconnectButton.setSensitive(true);
    }

    _setDisconnectedState(status) {
        this._currentState = 'disconnected';
        this._icon.icon_name = 'network-vpn-disconnected-symbolic';
        this._statusLabel.label.text = _('Status: Disconnected');
        this._detailsLabel.label.text = '';
        this._detailsLabel.visible = false;
        this._fqdnLabel.visible = false;
        this._ipv6Label.visible = false;
        this._dnsLabel.visible = false;
        this._healthLabel.visible = false;

        this._connectButton.setSensitive(true);
        this._disconnectButton.setSensitive(false);
    }

    _setNeedsLoginState(status) {
        const wasConnected = this._previousState === 'connected';

        this._currentState = 'needslogin';
        this._icon.icon_name = 'network-vpn-disconnected-symbolic';
        this._statusLabel.label.text = _('Status: Needs Login');

        this._detailsLabel.label.text = _('Click Connect to login');
        this._detailsLabel.visible = true;
        this._fqdnLabel.visible = false;
        this._ipv6Label.visible = false;
        this._dnsLabel.visible = false;
        this._healthLabel.visible = false;

        this._connectButton.setSensitive(true);
        this._disconnectButton.setSensitive(false);

        if (wasConnected) {
            this._handleSessionExpiration();
        }
    }

    _setErrorState(errorMsg) {
        this._currentState = 'error';
        this._icon.icon_name = 'network-error-symbolic';
        this._statusLabel.label.text = `Status: ${errorMsg}`;
        this._detailsLabel.label.text = '';
        this._detailsLabel.visible = false;
        this._fqdnLabel.visible = false;
        this._ipv6Label.visible = false;
        this._dnsLabel.visible = false;
        this._healthLabel.visible = false;

        this._connectButton.setSensitive(false);
        this._disconnectButton.setSensitive(false);
    }

    _handleSessionExpiration() {
        const expirationAction = this._settings.get_string('expiration-action');

        switch (expirationAction) {
            case 'notify':
                Main.notify(
                    _('Netbird Session Expired'),
                    _('Your Netbird session has expired. Click the VPN icon to reconnect.')
                );
                break;

            case 'notify-action':
                const source = new MessageTray.Source({
                    title: _('Netbird Session Expired'),
                    iconName: 'network-vpn-disconnected-symbolic',
                });
                Main.messageTray.add(source);

                const notification = new MessageTray.Notification({
                    source: source,
                    title: _('Netbird Session Expired'),
                    body: _('Your Netbird session has expired.'),
                });
                notification.addAction(_('Reconnect'), () => {
                    this._executeNetbirdUp();
                });
                source.addNotification(notification);
                break;

            case 'auto-reconnect':
                this._executeNetbirdUp();
                break;

            case 'none':
            default:
                break;
        }
    }

    async _executeNetbirdUp() {
        if (this._currentState === 'needslogin') {
            Main.notify(_('Netbird'), _('Logging in...'));
            const loginResult = await this._executeNetbirdCommand(['login']);
            if (!loginResult.success) {
                Main.notify(_('Netbird Error'), _(`Login failed: ${loginResult.stderr}`));
                this._updateStatus();
                return;
            }
        }

        Main.notify(_('Netbird'), _('Connecting...'));
        const result = await this._executeNetbirdCommand(['up']);
        if (result.success) {
            this._updateStatus();
        } else {
            Main.notify(_('Netbird Error'), _(`Failed to connect: ${result.stderr}`));
            this._updateStatus();
        }
    }

    async _executeNetbirdDown() {
        const result = await this._executeNetbirdCommand(['down']);
        if (result.success) {
            Main.notify(_('Netbird'), _('Disconnecting...'));
            this._updateStatus();
        } else {
            Main.notify(_('Netbird Error'), _(`Failed to disconnect: ${result.stderr}`));
        }
    }

    async _executeNetbirdUI() {
        try {
            const launcher = new Gio.SubprocessLauncher({
                flags: Gio.SubprocessFlags.NONE,
            });
            launcher.spawnv(['/usr/bin/netbird-ui', '-settings']);
        } catch (e) {
            logError(e, 'Failed to launch netbird-ui');
            Main.notify(_('Netbird Error'), _('Failed to launch Advanced Settings'));
        }
    }

    async _executeNetbirdProfilesUI() {
        try {
            const launcher = new Gio.SubprocessLauncher({
                flags: Gio.SubprocessFlags.NONE,
            });
            launcher.spawnv(['/usr/bin/netbird-ui', '-profiles']);
        } catch (e) {
            logError(e, 'Failed to launch netbird-ui profiles');
            Main.notify(_('Netbird Error'), _('Failed to launch Profile Manager'));
        }
    }

    _startPolling() {
        if (this._pollSourceId !== null) {
            return;
        }

        const intervalSeconds = this._settings.get_int('refresh-interval');
        const intervalMs = intervalSeconds * 1000;

        this._pollSourceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, intervalMs, () => {
            this._updateStatus();
            return GLib.SOURCE_CONTINUE;
        });
    }

    _stopPolling() {
        if (this._pollSourceId !== null) {
            GLib.source_remove(this._pollSourceId);
            this._pollSourceId = null;
        }
    }

    destroy() {
        this._stopPolling();
        super.destroy();
    }
});

export default class NetbirdExtension extends Extension {
    enable() {
        this._settings = this.getSettings('org.gnome.shell.extensions.netbird');
        this._indicator = new Indicator(this._settings);
        Main.panel.addToStatusArea(this.uuid, this._indicator);
        this._indicator._updateStatus();
        this._indicator._updateProfiles();
        this._indicator._startPolling();
    }

    disable() {
        this._indicator.destroy();
        this._indicator = null;
        this._settings = null;
    }
}
