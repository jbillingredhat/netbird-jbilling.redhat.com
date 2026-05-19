import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class NetbirdPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings('org.gnome.shell.extensions.netbird');

        const page = new Adw.PreferencesPage();
        const group = new Adw.PreferencesGroup({
            title: 'Netbird Settings',
            description: 'Configure Netbird extension behavior',
        });
        page.add(group);

        const browserRow = new Adw.EntryRow({
            title: 'Browser Command',
        });
        browserRow.set_text(settings.get_string('browser-command'));
        browserRow.connect('changed', (entry) => {
            settings.set_string('browser-command', entry.get_text());
        });
        group.add(browserRow);

        const browserHint = new Adw.ActionRow({
            title: 'Examples:',
        });
        const hintLabel = new Gtk.Label({
            label: '/usr/bin/epiphany --private-instance\n/usr/bin/firefox --private-window\nLeave empty for system default',
            xalign: 0,
            wrap: true,
        });
        hintLabel.add_css_class('dim-label');
        browserHint.add_suffix(hintLabel);
        group.add(browserHint);

        const intervalRow = new Adw.SpinRow({
            title: 'Refresh Interval',
            subtitle: 'How often to check netbird status (seconds)',
            adjustment: new Gtk.Adjustment({
                lower: 5,
                upper: 60,
                step_increment: 1,
            }),
        });
        intervalRow.set_value(settings.get_int('refresh-interval'));
        intervalRow.connect('changed', (spin) => {
            settings.set_int('refresh-interval', spin.get_value());
        });
        group.add(intervalRow);

        window.add(page);
    }
}
