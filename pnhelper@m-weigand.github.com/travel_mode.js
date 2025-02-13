/*
Implement a travel mode switch in the Quick settings
*/
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as QuickSettings from 'resource:///org/gnome/shell/ui/quickSettings.js';

// regenerate with
// dbus-send --system --print-reply --dest=org.pinenote.misc /misc org.freedesktop.DBus.Introspectable.Introspect
const PinenoteMiscDbusInterface = `
<node>
  <interface name="org.pinenote.misc">
    <method name="DisableTravelMode">
    </method>
    <method name="EnableTravelMode">
    </method>
    <method name="GetTravelMode">
      <arg name="in_travel_mode" type="u" direction="out"/>
    </method>
    <signal name="TravelModeChanged">
    </signal>
  </interface>
</node>
`

const PinenoteMiscDbusProxy = Gio.DBusProxy.makeProxyWrapper(PinenoteMiscDbusInterface);

var PnMiscProxy = new PinenoteMiscDbusProxy(
    Gio.DBus.system,
    "org.pinenote.misc",
    "/misc",
);

export function misc_enable_travel_mode(){
    PnMiscProxy.EnableTravelModeAsync();
}

export function misc_disable_travel_mode(){
    PnMiscProxy.DisableTravelModeAsync();
}

export function misc_get_travel_mode(){
    let state = PnMiscProxy.GetTravelModeSync();
    return state[0];
}

export function misc_subscribe_to_travelmodechanged(func, widget){
    function func_signal (connection, sender, path, iface, signal, params){
        func(connection, sender, path, iface, signal, params, widget);
    }
    const misc_dbus = PnMiscProxy.connectSignal(
        "TravelModeChanged", func_signal
    );
    return(misc_dbus);
}

//Disconnect from the dbus signal when the extension is stopped
export function misc_unsubscribe(dbus_handler){
    PnMiscProxy.disconnectSignal(dbus_handler);
}

const TravelModeToggle = GObject.registerClass(
class TravelModeToggle extends QuickSettings.QuickToggle {
    _init(settings, extensionObject) {
        super._init({
            title: _('Travel Mode'),
            subtitle: _('Cover wakup enable/disable'),
            iconName: 'selection-mode-symbolic',
            toggleMode: true,
        });

        this.signal_mode_changed = misc_subscribe_to_travelmodechanged(
            this.on_mode_change,
            this // "obj" parameter
        );

        this._settings = settings;

        this._settings.connect('changed::travel-mode', (settings, key) => {
            this._apply_travel_mode(this._settings.get_boolean(key));
        });

        this.connectObject(
            'destroy', () => this._on_destroy(),
            'clicked', () => this._toggleMode(),
            this
        );
        this._sync();
    }

    on_mode_change(connection, sender, path, iface, signal, params, obj) {
        obj._sync();
    }

    _sync(){
        const checked = misc_get_travel_mode();
        this.set({checked});
    }

    _on_destroy(){
        misc_unsubscribe(this.signal_mode_changed);
    }

    _toggleMode(){
        let state = misc_get_travel_mode();
        const force = state != this._settings.get_boolean('travel-mode');

        state = !state;
        log(`TravelModel: Toggle ${state ? "On" : "Off"}`);

        this._settings.set_boolean('travel-mode', state);
        if (force) {
            log(`travel_mode was out of sync with settings`);
            this._apply_travel_mode(state);
        }

        this._settings.set_boolean('travel-mode', state);
    }

    _apply_travel_mode(value){
        //this.set(value);
        if (value){
            misc_enable_travel_mode();
        } else {
            misc_disable_travel_mode();
        }
    }

});


export const Indicator = GObject.registerClass(
class Indicator extends QuickSettings.SystemIndicator {
    _init(settings) {
        super._init();
        this._toggle = new TravelModeToggle(settings);
        this.quickSettingsItems.push(this._toggle);
    }

});
