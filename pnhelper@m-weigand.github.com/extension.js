/*
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
 *
 * Based on:
 * https://raw.githubusercontent.com/kosmospredanie/gnome-shell-extension-screen-autorotate/main/screen-autorotate%40kosmospredanie.yandex.ru/extension.js
 */
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';

import * as QuickSettings from 'resource:///org/gnome/shell/ui/quickSettings.js';
// const St = imports.gi.St;
// const { Clutter, GLib, Gio, GObject } = imports.gi;
// const QuickSettings = imports.ui.quickSettings;

// This is the live instance of the Quick Settings menu
// const QuickSettingsMenu = imports.ui.main.panel.statusArea.quickSettings;
import {QuickSettingsMenu} from 'resource:///org/gnome/shell/ui/quickSettings.js';

// TODO
// const ExtensionUtils = imports.misc.extensionUtils;

// TODO
// const Me = ExtensionUtils.getCurrentExtension();

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
// const Main = imports.ui.main;

//const PanelMenu = imports.ui.panelMenu;
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
// const PopupMenu = imports.ui.popupMenu;
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
// const Slider = imports.ui.slider;
import * as Slider from 'resource:///org/gnome/shell/ui/slider.js';

// const ModalDialog = imports.ui.modalDialog;
import * as ModalDialog from 'resource:///org/gnome/shell/ui/modalDialog.js';

import {Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

// const BusUtils = Me.imports.busUtils;
import * as BusUtils from './busUtils.js';

// const ebc = Me.imports.ebc;
// const usb = Me.imports.usb;
// const btpen = Me.imports.btpen;

import * as ebc from './ebc.js';
import * as usb from './usb.js';
import * as travel_mode from './travel_mode.js';

//import * as display_rotator from './rotator.js';
// import * as btpen from './btpen.js';

// 'use strict';

const Orientation = Object.freeze({
    'normal': 0,
    'left-up': 1,
    'bottom-up': 2,
    'right-up': 3
});

// /////////////////////////////
//

var USBDialog = GObject.registerClass(
    class USBDialog_a extends ModalDialog.ModalDialog {
        _init() {
            super._init();
            // this.result = -1;

            this._cancelButton = this.addButton({
            // note: I get JS errors for this class, but am not
            // sure if this is a bug in this code or in
            // gnome-shell...
            // error msg:
            // JS ERROR: Error: Argument descendant may not be null
            label: _('Do nothing'),
                 action: this._onFailure.bind(this),
                 key: Clutter.KEY_Escape,
            });
            this._okButton = this.addButton({
                 label: _('Keep Changes'),
                 action: this._onSuccess.bind(this),
                 // default: true,
            });
            this._choice_3 = this.addButton({
                 label: _('Variant 3'),
                 //action: this._set_result(3),
                 action: () => {
                    this._set_result(3)
                },
                //default: true,
            });
        }

        _set_result(result) {
            this.result = 3;
            log("RESULT: ");
            log(`${result}`)
            this.close();
            // return true;
        };

        _onFailure() {
        //this._wm.complete_display_change(false);
        this.close();
        };

        _onSuccess() {
        //this._wm.complete_display_change(true);
        this.close();
        };
    }
);

/*
// Creating a dialog layout
const parentActor = new St.Widget();
const dialogLayout = new Dialog.Dialog(parentActor, 'my-dialog');

// Adding a widget to the content area
const icon = new St.Icon({icon_name: 'dialog-information-symbolic'});
dialogLayout.contentLayout.add_child(icon);

// Adding a default button
dialogLayout.addButton({
    label: 'Close',
    isDefault: true,
    action: () => {
        dialogLayout.destroy();
    },
});
*/

// /////////////////////////////


var TriggerRefreshButton = GObject.registerClass(
    class TriggerRefreshButton extends PanelMenu.Button {
    _init() {
        super._init();
        this.set_track_hover(true);
        this.set_reactive(true);

        this.add_child(new St.Icon({
            icon_name: 'view-refresh-symbolic',
            style_class: 'system-status-icon'
        }));

        this.connect('button-press-event', this._trigger_btn.bind(this));
        this.connect('touch-event', this._trigger_touch.bind(this));
    }

    _trigger_touch(widget, event) {
        if (event.type() !== Clutter.EventType.TOUCH_BEGIN){
            ebc.ebc_trigger_global_refresh();
        }
    }

    _trigger_btn(widget, event) {
        ebc.ebc_trigger_global_refresh();
    }
});


/* This class defines a button, to be placed in the GNOME top panel, that is
 * used to switch between various performance/quality modes. Here, we define an
 * ebc mode as a combination of dclk frequency (either 200 MHz or ca. 250 MHz),
 * and a DRM display mode.
 *
 * The idea here is: Define a "quality" mode that reduces visible artifacts as
 * much as possible, with the downside of having bad latency. This mode is
 * intended for high-quality, low-speed, task such as reading or slow web
 * browsing. It is not intended for writing.
 *
 * Another mode is the performance mode. Here, speed is gained at the expense
 * of visual quality. However, for a lot of scenarios that involve high-speed
 * writing, a certain of amount of visual glitches can be accepted.
 *
 * Note that these ebc modes only relate to the dclk clock (which controls
 * basically how fast data is sent to the ebc display), and the drm mode, which
 * (for the m-weigand kernel) controls basically only compositor-related
 * refresh rates. These modes are independent of the waveforms used!
 *
 * For now we differentiate between quality and performance mode by reading the
 * dclk_select module parameter of the rockchip_ebc kernel module.
 *
 * */
var PerformanceModeButton = GObject.registerClass(
    class PerformanceModeButton extends PanelMenu.Button {
    _init(metadata, settings) {
        super._init();
        this.set_track_hover(true);
        this.set_reactive(true);
        this.metadata = metadata;
        this._settings = settings;

        const dclk_select = ebc.PnProxy.GetDclkSelectSync();

        let label_text = 'N'
        let new_mode = ''
        // set mode (i.e., refresh rate) according to the dclk_select
            // value
        if (dclk_select == 0){
            console.log("Quality mode");
            console.log("Switching to 5 Hz refresh rate");
            new_mode = '1872x1404@5.000';
            label_text = 'Q'
        } else if (dclk_select == 1) {
            label_text = 'P'
            console.log("Performance mode");
            console.log("Switching to 80 Hz refresh rate");
            new_mode = '1872x1404@80.000';
        }

        // disable trying to fix the mode on initialization
        // this only throws an exception
        /*
        try {
            GLib.spawn_async(
                Me.path,
                ['gjs', `${Me.path}/mode_switcher.js`, `${new_mode}`],
                null,
                GLib.SpawnFlags.SEARCH_PATH,
                null);
        } catch (err) {
            logError(err);
        }
        */

        this.panel_label = new St.Label({
            text: label_text,
            y_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });

        this.add_child(this.panel_label);

        this.connect('button-press-event', this._trigger_btn.bind(this));
        this.connect('touch-event', this._trigger_touch.bind(this));

        this.update_label()
    }

    switch_mode() {
        log('MODE SWITCH');
        const dclk_select = ebc.PnProxy.GetDclkSelectSync();
        let new_mode = ''

        if (dclk_select == 0){
            // we are in quality mode and want performance mode
            log('switching to performance mode');
            new_mode = '1872x1404@80.000';
            ebc.PnProxy.SetDclkSelectSync(1);
        }
        else if (dclk_select == 1){
            log('switching to quality mode');
            // new_mode = '1872x1404@1.000';
            new_mode = '1872x1404@5.000';
            ebc.PnProxy.SetDclkSelectSync(0);
        } else
            return;
        this.update_label()
        log("new mode:");
        log(new_mode);

        const no_off_screen = this._settings.get_boolean('no-off-screen');
        ebc.PnProxy.SetNoOffScreenSync(no_off_screen);

        try {
            GLib.spawn_async(
                this.metadata.path,
                ['gjs', '-m', `${this.metadata.path}/mode_switcher.js`, `${new_mode}`],
                null,
                GLib.SpawnFlags.SEARCH_PATH,
                null);
        } catch (err) {
            logError(err);
        }

        const removeId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
            log('This callback will be invoked once after 1 seconds');
            ebc.ebc_trigger_global_refresh();

            // GLib.Source.remove(timeoutId);

            return GLib.SOURCE_REMOVE;
        });
    }

    update_label() {
        const dclk_select = ebc.PnProxy.GetDclkSelectSync()[0];
        this.panel_label.set_text(dclk_select == 1 ? 'P' : 'Q');
    }

    _trigger_touch(widget, event) {
        if (event.type() !== Clutter.EventType.TOUCH_BEGIN){
            this.switch_mode();
            // ebc.ebc_trigger_global_refresh();
        }
    }

    _trigger_btn(widget, event) {
        // ebc.ebc_trigger_global_refresh();
        this.switch_mode();
    }
});

var WarmSlider = GObject.registerClass(
    class FeatureSlider extends QuickSettings.QuickSlider {
        _init() {
            super._init({
                icon_name: 'weather-clear-night-symbolic',
            });

            this.filepath = "/sys/class/backlight/backlight_warm/brightness";
            this.max_filepath = "/sys/class/backlight/backlight_warm/max_brightness";

            // set slider to current value
            this.max_value = this._get_content(this.max_filepath);
            let cur_value = this._get_content(this.filepath);

            let cur_slider = cur_value / this.max_value;
            log(`Current value: ${cur_value} - ${cur_slider}`);
            this.slider.unblock_signal_handler(this._sliderChangedId);

            this.slider.block_signal_handler(this._sliderChangedId);
            this.slider.value = cur_slider;

            this._sliderChangedId = this.slider.connect('notify::value',
                this._onSliderChanged.bind(this));

            this._onSettingsChanged();

            // Set an accessible name for the slider
            this.slider.accessible_name = _("Warm Backlight Brightness");
        }

        _onSettingsChanged() {
            // Prevent the slider from emitting a change signal while being updated
            this.slider.block_signal_handler(this._sliderChangedId);
            // this.slider.value = this._settings.get_uint('feature-range') / 100.0;
            this.slider.unblock_signal_handler(this._sliderChangedId);
        }

        _write_to_sysfs_file(filename, value){
            try {
                // The process starts running immediately after this
                // function is called. Any error thrown here will be a
                // result of the process failing to start, not the success
                // or failure of the process itself.
                let proc = Gio.Subprocess.new(
                    // The program and command options are passed as a list
                    // of arguments
                    ['/bin/sh', '-c', `echo ${value} > ` + filename],
                        // /sys/module/drm/parameters/debug'],

                    // The flags control what I/O pipes are opened and how they are directed
                    Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
                );

                // Once the process has started, you can end it with
                // `force_exit()`
                // proc.force_exit();
            } catch (e) {
                logError(e);
            }
        }

        _get_content(sysfs_file){
            // read current value
            const file = Gio.File.new_for_path(sysfs_file);
            const [, contents, etag] = file.load_contents(null);
            const ByteArray = imports.byteArray;
            const contentsString = ByteArray.toString(contents);

            return contentsString.replace(/[\n\r]/g, '');
        }

        _onSliderChanged() {
            // Assuming our GSettings holds values between 0..100, adjust
            // for the slider taking values between 0..1
            const percent = Math.floor(this.slider.value * 100);

            let relative = this.slider.value;
            const brightness = Math.round(relative * this._get_content(this.max_filepath));
            // log(`brightness: ${brightness}`);
            this._write_to_sysfs_file(this.filepath, brightness);
        }
});

var QuickSettingsWarmSlider = GObject.registerClass(
    class FeatureIndicator extends QuickSettings.SystemIndicator {
        _init() {
            super._init();
            console.log("pnhelper: QuickSettingsWarmSlider init");

            // Create the slider and associate it with the indicator, being
            // sure to destroy it along with the indicator
            this.quickSettingsItems.push(new WarmSlider());

            this.connect('destroy', () => {
                this.quickSettingsItems.forEach(item => item.destroy());
            });

            // Add the indicator to the panel
            // TODO
            // QuickSettingsMenu._indicators.add_child(this);

            // Add the slider to the menu, this time passing `2` as the second
            // argument to ensure the slider spans both columns of the menu
            // TODO
            // QuickSettingsMenu._addItems(this.quickSettingsItems, 2);

            // Move the slider from the bottom to be with the cool light slider
            // TODO
            // for (const item of this.quickSettingsItems) {
            //  QuickSettingsMenu.menu._grid.set_child_below_sibling(
            //      item,
            //      QuickSettingsMenu._brightness.quickSettingsItems[0]
            //  );
            // }
        }
});


// This class defines the actual extension
// See:
// https://gjs.guide/extensions/topics/extension.html
export default class PnHelperExtension extends Extension {
    constructor(metadata) {
        super(metadata);
        this._indicator = null;
        this._indicator2 = null;
        this._settings = null;
    }

    onWaveformChanged(connection, sender, path, iface, signal, params, widget) {
        // todo: look into .bind to access the label
        log("Signal received: WaveformChanged");
        this.update_panel_label();
        this.update_popup_bw_mode();
    }

    update_panel_label() {
        const waveform = ebc.PnProxy.GetDefaultWaveformSync();
        const bw_mode = ebc.PnProxy.GetBwModeSync();
        var new_label = '';
        if (bw_mode == 0){
            new_label += 'G:';
        } else if (bw_mode == 1) {
            new_label += 'BW+D:';
        } else if (bw_mode == 2) {
            new_label += 'BW:';
        } else if (bw_mode == 3) {
            new_label += 'DU4:';
        }

        new_label += waveform.toString();
        this.panel_label.set_text(new_label);
    }

    _write_to_sysfs_file(filename, value){
        try {
            // The process starts running immediately after this function is called. Any
            // error thrown here will be a result of the process failing to start, not
            // the success or failure of the process itself.
            let proc = Gio.Subprocess.new(
                // The program and command options are passed as a list of arguments
                ['/bin/sh', '-c', `echo ${value} > ` + filename],
                    // /sys/module/drm/parameters/debug'],

                // The flags control what I/O pipes are opened and how they are directed
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
            );

            // Once the process has started, you can end it with `force_exit()`
            // proc.force_exit();
        } catch (e) {
            logError(e);
        }
    }

    _change_bw_mode(new_mode){

        // change the mode BEFORE setting the waveform so a potential
        // bw-conversion will be properly handled
        // this._write_to_sysfs_file(
        //  '/sys/module/rockchip_ebc/parameters/bw_mode',
        //  new_mode
        // );
        log(`Changing bw_mode = ${new_mode}`);
        ebc.PnProxy.SetBwModeSync(new_mode);

        if (new_mode == 0){
            // use GC16 waveform
            // this._set_waveform(4);
            ebc.PnProxy.SetDefaultWaveformSync(4);
        } else if (new_mode == 1){
            // use A2 waveform
            ebc.PnProxy.SetDefaultWaveformSync(1);
            // this._set_waveform(1);
        } else if (new_mode == 2){
            // use A2 waveform
            // this._set_waveform(1);
            ebc.PnProxy.SetDefaultWaveformSync(1);
        } else if (new_mode == 3){
            // use DU4 waveform
            ebc.PnProxy.SetDefaultWaveformSync(3);
        }

        // trigger a global refresh
        setTimeout(
            ebc.ebc_trigger_global_refresh,
            500
        );
    }

    update_popup_bw_mode(){
        const bw_mode = ebc.PnProxy.GetBwModeSync();

        if (bw_mode == 0){
            // grayscale mode
            this.m_bw_slider.visible = false;
            this.mitem_bw_dither_invert.visible = false;
        } else if (bw_mode == 1){
            // bw+dither mode
            this.m_bw_slider.visible = false;
            this.mitem_bw_dither_invert.visible = true;
            // this._set_waveform(1);
        } else if (bw_mode == 2){
            // Black & White mode
            this.m_bw_slider.visible = true;
            this.mitem_bw_dither_invert.visible = true;
        } else if (bw_mode == 3){
            // DU4 mode
            this.m_bw_slider.visible = false;
            this.mitem_bw_dither_invert.visible = true;
        }

        // set the ornament for all buttons
        this.bw_but_grayscale.setOrnament(bw_mode == 0 ? PopupMenu.Ornament.CHECK : PopupMenu.Ornament.NONE);
        this.bw_but_bw_dither.setOrnament(bw_mode == 1 ? PopupMenu.Ornament.CHECK : PopupMenu.Ornament.NONE);
        this.bw_but_bw       .setOrnament(bw_mode == 2 ? PopupMenu.Ornament.CHECK : PopupMenu.Ornament.NONE);
        this.bw_but_du4      .setOrnament(bw_mode == 3 ? PopupMenu.Ornament.CHECK : PopupMenu.Ornament.NONE);
    }

    _add_bw_buttons() {
        // add three buttons for grayscale, bw, bw+dithering modes

        // 1
        this.bw_but_grayscale = new PopupMenu.PopupMenuItem(_('Grayscale Mode'));
        this.bw_but_grayscale.connect('activate', () => {
            this._settings.set_uint("bw-mode", 0);
        });
        this._indicator.menu.addMenuItem(this.bw_but_grayscale);

        // 2
        this.bw_but_bw_dither = new PopupMenu.PopupMenuItem(_('BW+Dither Mode'));
        this.bw_but_bw_dither.connect('activate', () => {
            this._settings.set_uint("bw-mode", 1);
        });
        this._indicator.menu.addMenuItem(this.bw_but_bw_dither);

        // 3
        this.bw_but_bw = new PopupMenu.PopupMenuItem(_('BW Mode'));
        this.bw_but_bw.connect('activate', () => {
            this._settings.set_uint("bw-mode", 2);
        });
        this._indicator.menu.addMenuItem(this.bw_but_bw);

        this._add_bw_slider();

        // 4
        this.bw_but_du4 = new PopupMenu.PopupMenuItem(_('DU4 Mode'));
        this.bw_but_du4.connect('activate', () => {
            this._settings.set_uint("bw-mode", 3);
        });
        this._indicator.menu.addMenuItem(this.bw_but_du4);
    }

    _add_bw_slider() {
        console.log("pnhelper: adding bw slider");
        this.m_bw_slider = new PopupMenu.PopupBaseMenuItem({ activate: true });
        this._indicator.menu.addMenuItem(this.m_bw_slider);

        this._bw_slider = new Slider.Slider(0.5);

        this._sliderChangedId = this._bw_slider.connect('notify::value',
            this._bw_slider_changed.bind(this));
        this._bw_slider.accessible_name = _("BW Threshold");

        const icon = new St.Icon({
            icon_name: 'display-brightness-symbolic',
            style_class: 'popup-menu-icon',
        });
        this.m_bw_slider.add_child(icon);
        this.m_bw_slider.add_child(this._bw_slider);
        this.m_bw_slider.connect('button-press-event', (actor, event) => {
            return this._bw_slider.startDragging(event);
        });
        this.m_bw_slider.connect('key-press-event', (actor, event) => {
            return this._bw_slider.emit('key-press-event', event);
        });
        this.m_bw_slider.connect('scroll-event', (actor, event) => {
            return this._bw_slider.emit('scroll-event', event);
        });
    }

    _bw_slider_changed(){
        let bw_threshold;
        // transform to thresholds 1 to 7 in roughly similar-sized bins
        bw_threshold = 4 + Math.floor(this._bw_slider.value * 9);
        log(`new bw threshold: ${bw_threshold}`);
        this._write_to_sysfs_file(
            '/sys/module/rockchip_ebc/parameters/bw_threshold',
            bw_threshold
        );
    }

    _set_a1_waveform(){
        ebc.PnProxy.SetDefaultWaveformSync(1);
    }

    _set_waveform(waveform){
        ebc.PnProxy.SetDefaultWaveformSync(waveform);
    }

    _test_func(){
        log("TEST function");

        const test_dialog = new USBDialog();
        test_dialog.open();
        // let dd = test_dialog.result;
        // log(`test dialog: ${dd}`);
    }

    _add_testing_button(){
        let item;
        item = new PopupMenu.PopupMenuItem(_('TEST'));
        item.connect('activate', () => {
            this._test_func();
        });
        this._indicator.menu.addMenuItem(item);
    }

    _add_usb_mtp_gadget_buttons(){
        let item;
        item = new PopupMenu.PopupMenuItem(_('Start USB MTP'));
        item.connect('activate', () => {
            usb.PnUSBProxy.usb_gadget_activate_mtpSync();
        });
        this._indicator.menu.addMenuItem(item);

        let item2;
        item2 = new PopupMenu.PopupMenuItem(_('Stop USB MTP'));
        item2.connect('activate', () => {
            usb.PnUSBProxy.usb_gadget_disable_mtpSync();
        });
        this._indicator.menu.addMenuItem(item2);
    }

    _add_waveform_buttons(){
        let item;
        item = new PopupMenu.PopupMenuItem(_('A2 Waveform'));
        item.connect('activate', () => {
            this._set_waveform(1);
        });
        this._indicator.menu.addMenuItem(item);

        // item = new PopupMenu.PopupMenuItem(_('DU Waveform'));
        // item.connect('activate', () => {
        //  this._set_waveform(2);
        // });
        // this._indicator.menu.addMenuItem(item);

        item = new PopupMenu.PopupMenuItem(_('GC16 Waveform'));
        item.connect('activate', () => {
            this._set_waveform(4);
        });
        this._indicator.menu.addMenuItem(item);

//      item = new PopupMenu.PopupMenuItem(_('DU4 Waveform'));
//      item.connect('activate', () => {
//          this._set_waveform(7);
//      });
//      this._indicator.menu.addMenuItem(item);
    }

    _add_auto_refresh_button(){
        this.mitem_auto_refresh = new PopupMenu.PopupMenuItem(_('Auto Refresh Enabled'));
        let auto_refresh = ebc.PnProxy.GetAutoRefreshSync()[0];

        this.mitem_auto_refresh.connect('activate', () => {
            this.toggle_auto_refresh();
        });

        this._indicator.menu.addMenuItem(this.mitem_auto_refresh);

        ebc.PnProxy.connectSignal("AutoRefreshChanged", this.update_auto_refresh_button.bind(this));

        this.update_auto_refresh_button();
    }

    toggle_auto_refresh(){
        let auto_refresh = ebc.PnProxy.GetAutoRefreshSync()[0];
        const force = auto_refresh != this._settings.get_boolean('auto-refresh');

        auto_refresh = !auto_refresh;

        this._settings.set_boolean('auto-refresh', auto_refresh);
        if (force) {
            log(`auto_refresh was out of sync with settings`);
            this._apply_auto_refresh(auto_refresh);
        }

        this._settings.set_boolean('auto-refresh', auto_refresh);
    }

    _apply_auto_refresh(value) {
        log(`Setting auto refresh to ${value}`);
        ebc.PnProxy.SetAutoRefreshSync(value);
    }

    update_auto_refresh_button(){
        let auto_refresh = ebc.PnProxy.GetAutoRefreshSync()[0];
        this.mitem_auto_refresh.label.set_text(_(`Auto Refresh ${auto_refresh ? 'Enabled' : 'Disabled'}`));
    }

    _add_dither_invert_button(){
        this.mitem_bw_dither_invert = new PopupMenu.PopupMenuItem(_('BW Invert On'));
        let bw_dither_invert = ebc.PnProxy.GetBwDitherInvertSync()[0];

        this.mitem_bw_dither_invert.connect('activate', () => {
            this.toggle_bw_dither_invert();
        });

        this._indicator.menu.addMenuItem(this.mitem_bw_dither_invert);

        ebc.PnProxy.connectSignal("BwDitherInvertChanged", this.update_bw_dither_invert_button.bind(this));

        this.update_bw_dither_invert_button();
    }

    toggle_bw_dither_invert(){
        let bw_dither_invert = ebc.PnProxy.GetBwDitherInvertSync()[0];
        const force = bw_dither_invert != this._settings.get_boolean('bw-dither-invert');

        bw_dither_invert = !bw_dither_invert;

        this._settings.set_boolean('bw-dither-invert', bw_dither_invert);
        if (force) {
            log(`bw_dither_invert was out of sync with settings`);
            this._apply_bw_dither_invert(bw_dither_invert);
        }

        this._settings.set_boolean('bw-dither-invert', bw_dither_invert);
    }

    _apply_bw_dither_invert(value) {
        log(`Setting bw dither invert to ${value}`);
        ebc.PnProxy.SetBwDitherInvertSync(value);
    }

    update_bw_dither_invert_button() {
        let bw_dither_invert = ebc.PnProxy.GetBwDitherInvertSync()[0];
        this.mitem_bw_dither_invert.label.set_text(_(`BW Invert ${bw_dither_invert ? 'On' : 'Off'}`));
    }

    _add_refresh_button(){
        this._trigger_refresh_button = new TriggerRefreshButton();
        Main.panel.addToStatusArea(
            _("PN Trigger Global Refresh"),
            this._trigger_refresh_button,
            -1,
            'center'
        );
    }

    _add_performance_mode_button(){
        this._performance_mode_button = new PerformanceModeButton(this.metadata, this._settings);
        Main.panel.addToStatusArea(
            _("PN Switch Performance Modes"),
            this._performance_mode_button,
            -1,
            'center'
        );
    }

    _add_warm_indicator_to_main_gnome_menu() {
        // use the new quicksettings from GNOME 0.43
        // https://gjs.guide/extensions/topics/quick-settings.html#example-usage
        //
        let brightness_file = "/sys/class/backlight/backlight_warm/brightness";
        const file = Gio.file_new_for_path(brightness_file);
        if (!file.query_exists(null)){
            log("No warm backlight control found - will not add slider for that");
            return;
        }
        // initialize a new slider object
        // https://gjs.guide/extensions/topics/quick-settings.html
        this._indicator2 = new QuickSettingsWarmSlider();
        Main.panel.statusArea.quickSettings.addExternalIndicator(
            this._indicator2,
            2  // spawn two columns
        );
        // GLib.usleep(200000);
        // approach 2: directly insert the slider at the correct position
        // I think this fails because the other items are inserted
        // asynchronously
        // see ui/panel.js, line 622
        // let sibling = Main.panel.statusArea.quickSettings._brightness;
        // console.log(sibling);
        // console.log(Main.panel.statusArea.quickSettings._indicators);
        // Main.panel.statusArea.quickSettings._indicators.insert_child_below(
        //  this._indicator2,
        //  sibling
        // );
    }

    _add_travel_mode_toggle(){
        this._indicator_travel_mode = new travel_mode.Indicator(this._settings);
        Main.panel.statusArea.quickSettings.addExternalIndicator(
            this._indicator_travel_mode
        );
    }

    _add_no_off_screen_button(){
        console.log("pnhelper: adding no off screen button");
        this.mitem_no_off_screen = new PopupMenu.PopupMenuItem(_('Clear Screen on Suspend'));

        // Initialize
        const no_off_screen = this._settings.get_boolean("no-off-screen");
        if (no_off_screen != ebc.PnProxy.GetNoOffScreenSync()) {
            this._apply_no_off_screen(no_off_screen);
        }

        this.mitem_no_off_screen.connect('activate', () => {
            this.toggle_no_off_screen();
        });

        this._indicator.menu.addMenuItem(this.mitem_no_off_screen);

        ebc.PnProxy.connectSignal("NoOffScreenChanged", this.update_no_off_screen_button.bind(this));

        this.update_no_off_screen_button();
    }

    toggle_no_off_screen(){
        let no_off_screen = ebc.PnProxy.GetNoOffScreenSync()[0];
        const force = no_off_screen != this._settings.get_boolean('no-off-screen');

        no_off_screen = !no_off_screen;

        this._settings.set_boolean('no-off-screen', no_off_screen);
        if (force) {
            log(`no_off_screen was out of sync with settings`);
            this._apply_no_off_screen(no_off_screen);
        }
    }

    _apply_no_off_screen(value) {
        log(`Setting no off screen to ${value}`);
        ebc.PnProxy.SetNoOffScreenSync(value);
    }

    update_no_off_screen_button() {
        let no_off_screen = ebc.PnProxy.GetNoOffScreenSync()[0];
        this.mitem_no_off_screen.label.set_text(_(`${no_off_screen ? 'Clear' : 'Keep'} screen on Suspend`));
    }

    enable() {
        log(`enabling ${this.metadata.name}`);
        this._settings = this.getSettings();

        this._add_refresh_button();
        this._add_performance_mode_button();
        this._add_warm_indicator_to_main_gnome_menu();
        this._add_travel_mode_toggle();

        // ////////////////////////////////////////////////////////////////////
        this._topBox = new St.BoxLayout({ });

        // Button 1
        let indicatorName = _(`${this.metadata.name} Indicator`);

        // Create a panel button
        this._indicator = new PanelMenu.Button(0.0, indicatorName, false);

        // Add an icon
        let icon = new St.Icon({
            //gicon: new Gio.ThemedIcon({name: 'face-laugh-symbolic'}),
            gicon: new Gio.ThemedIcon({name: 'org.gnome.SimpleScan-symbolic'}),
            style_class: 'system-status-icon'
        });
        // this._indicator.add_child(icon);

        // TODO
        this._topBox.add_child(icon);

        this.panel_label = new St.Label({
            text: "DADA",
            y_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        // Add the label
        // this._indicator.add_child(this.panel_label);
        this.dbus_proxy = ebc.ebc_subscribe_to_waveformchanged(
            this.onWaveformChanged.bind(this),
            this.panel_label
        );

        this._topBox.add_child(this.panel_label);
        this._indicator.add_child(this._topBox);
        // this._indicator.label_actor = this.panel_label;
        // this._indicator.add_actor(this.panel_label);

        // `Main.panel` is the actual panel you see at the top of the screen,
        // // not a class constructor.
        Main.panel.addToStatusArea(
            indicatorName,
            this._indicator,
            -2,
            'center'
        );

        let item;
        item = new PopupMenu.PopupMenuItem(_('Rotate'));
        item.connect('activate', () => {
            this.rotate_screen();
        });
        this._indicator.menu.addMenuItem(item);

        this._settings.connect('changed::auto-refresh', (settings, key) => {
            this._apply_auto_refresh(this._settings.get_boolean(key));
        });
        this._settings.connect('changed::bw-dither-invert', (settings, key) => {
            this._apply_bw_dither_invert(this._settings.get_boolean(key));
        });
        this._settings.connect('changed::bw-mode', (settings, key) => {
            this._change_bw_mode(this._settings.get_uint(key));
        });
        this._settings.connect('changed::no-off-screen', (settings, key) => {
            this._apply_no_off_screen(this._settings.get_boolean(key));
        });

        this._add_bw_buttons();
        this._add_dither_invert_button();
        this._add_auto_refresh_button();
        // this._add_waveform_buttons();
        // this._add_testing_button();
        this._add_usb_mtp_gadget_buttons();
        this._add_no_off_screen_button();

        // activate defaults
        const auto_refresh = this._settings.get_uint("auto-refresh");
        if (auto_refresh != ebc.PnProxy.GetAutoRefreshSync()[0]){
            this._apply_auto_refresh(auto_refresh);
        }
        const bw_dither_invert = this._settings.get_uint("bw-dither-invert");
        if (bw_dither_invert != ebc.PnProxy.GetBwDitherInvertSync()[0]){
            this._apply_bw_dither_invert(bw_dither_invert);
        }
        const bw_mode = this._settings.get_uint("bw-mode");
        if (bw_mode != ebc.PnProxy.GetBwModeSync()[0]){
            this._change_bw_mode(bw_mode);
        }
        const no_off_screen = this._settings.get_uint("no-off-screen");
        if (no_off_screen != ebc.PnProxy.GetNoOffScreenSync()[0]){
            this._apply_no_off_screen(no_off_screen);
        }

        // this._btpen = new btpen.Indicator_ng();
        this.update_panel_label();
        this.update_popup_bw_mode();
    }

    _get_content(sysfs_file){
        // read current value
        const file = Gio.File.new_for_path(sysfs_file);
        const [, contents, etag] = file.load_contents(null);
        const ByteArray = imports.byteArray;
        const contentsString = ByteArray.toString(contents);

        return contentsString.replace(/[\n\r]/g, '');
    }

    // REMINDER: It's required for extensions to clean up after themselves when
    // they are disabled. This is required for approval during review!
    disable() {
        log(`disabling ${this.metadata.name}`);

        ebc.ebc_unsubscribe(this.dbus_proxy)

        this._indicator.destroy();
        this._indicator = null;

        this._trigger_refresh_button.destroy();
        this._trigger_refresh_button = null;

        this._performance_mode_button.destroy();
        this._performance_mode_button = null;

        this._indicator2.destroy();
        this._indicator2 = null;

        this._indicator_travel_mode.quickSettingsItems.forEach(item => item.destroy());
        this._indicator_travel_mode.destroy();
        this._indicator_travel_mode = null;

        this._settings = null;
    }

    rotate_screen(){
        log('rotate_screen start');
        // let state = get_state();
        // let logical_monitor = state.get_logical_monitor_for(builtin_monitor.connector);
        // log(logical_monitor.transform);
        this.rotate_to("left-up");
    }

    rotate_to(orientation) {
        log('Rotate screen to ' + orientation);
        // display_rotator.toggle();
        let target = Orientation[orientation];
        try {
            GLib.spawn_async(
                this.metadata.path,
                ['gjs', '-m', `${this.metadata.path}/rotator.js`, `${target}`],
                null,
                GLib.SpawnFlags.SEARCH_PATH,
                null);
        } catch (err) {
            logError(err);
        }
    }
}


function init() {
    log(`initializing ${this.metadata.name}`);

    return new Extension();
}
