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
        });
        this.menu.addMenuItem(refreshButton);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

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

        if (status.daemonStatus === 'Connected') {
            this._setConnectedState(status);
        } else if (status.daemonStatus === 'NeedsLogin') {
            this._setNeedsLoginState(status);
        } else {
            this._setDisconnectedState(status);
        }
    }

    _setConnectedState(status) {
        this._currentState = 'connected';
        this._icon.icon_name = 'network-vpn-symbolic';
        this._statusLabel.label.text = _('Status: Connected');

        let details = [];
        if (status.netbirdIp) {
            details.push(`IP: ${status.netbirdIp}`);
        }
        if (status.peers) {
            const peerCount = status.peers.connected || status.peers.total || 0;
            details.push(`Peers: ${peerCount}`);
        }

        this._detailsLabel.label.text = details.join(' | ');
        this._detailsLabel.visible = details.length > 0;

        this._connectButton.setSensitive(false);
        this._disconnectButton.setSensitive(true);
    }

    _setDisconnectedState(status) {
        this._currentState = 'disconnected';
        this._icon.icon_name = 'network-vpn-disconnected-symbolic';
        this._statusLabel.label.text = _('Status: Disconnected');
        this._detailsLabel.label.text = '';
        this._detailsLabel.visible = false;

        this._connectButton.setSensitive(true);
        this._disconnectButton.setSensitive(false);
    }

    _setNeedsLoginState(status) {
        this._currentState = 'needslogin';
        this._icon.icon_name = 'network-vpn-disconnected-symbolic';
        this._statusLabel.label.text = _('Status: Needs Login');

        this._detailsLabel.label.text = _('Click Connect to login');
        this._detailsLabel.visible = true;

        this._connectButton.setSensitive(true);
        this._disconnectButton.setSensitive(false);
    }

    _setErrorState(errorMsg) {
        this._currentState = 'error';
        this._icon.icon_name = 'network-error-symbolic';
        this._statusLabel.label.text = `Status: ${errorMsg}`;
        this._detailsLabel.label.text = '';
        this._detailsLabel.visible = false;

        this._connectButton.setSensitive(false);
        this._disconnectButton.setSensitive(false);
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
        this._indicator._startPolling();
    }

    disable() {
        this._indicator.destroy();
        this._indicator = null;
        this._settings = null;
    }
}
