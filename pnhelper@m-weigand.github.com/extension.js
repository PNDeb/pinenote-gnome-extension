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
'use strict';

const St = imports.gi.St;
const { Clutter, GLib, Gio, GObject } = imports.gi;
const QuickSettings = imports.ui.quickSettings;

// This is the live instance of the Quick Settings menu
const QuickSettingsMenu = imports.ui.main.panel.statusArea.quickSettings;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const Slider = imports.ui.slider;

const ModalDialog = imports.ui.modalDialog;

const Orientation = Object.freeze({
    'normal': 0,
    'left-up': 1,
    'bottom-up': 2,
    'right-up': 3
});

const BusUtils = Me.imports.busUtils;

const ebc = Me.imports.ebc;
const usb = Me.imports.usb;
const btpen = Me.imports.btpen;

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
    _init() {
        super._init();
        this.set_track_hover(true);
        this.set_reactive(true);

		const dclk_select = ebc.PnProxy.GetDclkSelectSync();

		let label_text = 'N'
		let new_mode = ''
		if (dclk_select == 0){
			new_mode = '1872x1404@5.000';
			label_text = 'Q'
		} else if (dclk_select == 1) {
			label_text = 'P'
			new_mode = '1872x1404@40.000';
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
    }


    switch_mode() {
        log('MODE SWITCH');
		const dclk_select = ebc.PnProxy.GetDclkSelectSync();
		let new_mode = ''

		if (dclk_select == 0){
			// we are in quality mode and want performance mode
			log('switching to performance mode');
			new_mode = '1872x1404@40.000';
			ebc.PnProxy.SetDclkSelectSync(1);
			this.panel_label.set_text('P');
		}
		else if (dclk_select == 1){
			log('switching to quality mode');
			// new_mode = '1872x1404@1.000';
			new_mode = '1872x1404@5.000';
			ebc.PnProxy.SetDclkSelectSync(0);
			this.panel_label.set_text('Q');
		} else
			return;
		log("new mode:");
		log(new_mode);
		try {
			// The process starts running immediately after this
			// function is called. Any error thrown here will be a
			// result of the process failing to start, not the success
			// or failure of the process itself.
			let proc = Gio.Subprocess.new(
				// The program and command options are passed as a list
				// of arguments
				['/bin/sh', '-c', `echo 1 > /sys/module/rockchip_ebc/parameters/no_off_screen`],
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

		const removeId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
    		log('This callback will be invoked once after 1 seconds');
			ebc.ebc_trigger_global_refresh();

    		// GLib.Source.remove(timeoutId);

			return GLib.SOURCE_REMOVE;
		});
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
			this.slider.accessible_name = "Warm Backlight Brightness";
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

			// Create the slider and associate it with the indicator, being sure to
			// destroy it along with the indicator
			this.quickSettingsItems.push(new WarmSlider);

			this.connect('destroy', () => {
				this.quickSettingsItems.forEach(item => item.destroy());
			});

			// Add the indicator to the panel
			QuickSettingsMenu._indicators.add_child(this);

			// Add the slider to the menu, this time passing `2` as the second
			// argument to ensure the slider spans both columns of the menu
			QuickSettingsMenu._addItems(this.quickSettingsItems, 2);

			// Move the slider from the bottom to be with the cool light slider
			for (const item of this.quickSettingsItems) {
				QuickSettingsMenu.menu._grid.set_child_below_sibling(
					item,
					QuickSettingsMenu._brightness.quickSettingsItems[0]
				);
			}
		}
});

class Extension {
    constructor() {
        this._indicator = null;
        this._indicator2 = null;

		const home = GLib.getenv("HOME");
		const file = Gio.file_new_for_path(home + "/.config/pinenote/do_not_show_overview");
		if (file.query_exists(null)){
			log("disabling overview");
			Main.sessionMode.hasOverview = false;
		}
    }

	onWaveformChanged(connection, sender, path, iface, signal, params, widget) {
		// todo: look into .bind to access the label
		log("Signal received: WaveformChanged");
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
		widget.set_text(new_label);
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
		// 	'/sys/module/rockchip_ebc/parameters/bw_mode',
		// 	new_mode
		// );
		ebc.PnProxy.SetBwModeSync(new_mode);

		if (new_mode == 0){
			this.bw_but_grayscale.visible = true;
			this.bw_but_bw_dither.visible = true;
			this.bw_but_bw.visible = true;
			this.bw_but_du4 = true;
			this.m_bw_slider.visible = false;
			this.mitem_bw_dither_invert.visible = false;
			// use GC16 waveform
			// this._set_waveform(4);
			ebc.PnProxy.SetDefaultWaveformSync(4);
		} else if (new_mode == 1){
			// bw+dither
			this.bw_but_grayscale.visible = true;
			this.bw_but_bw_dither.visible = true;
			this.bw_but_bw.visible = true;
			this.bw_but_du4 = true;
			this.m_bw_slider.visible = false;
			this.mitem_bw_dither_invert.visible = true;
			// use A2 waveform
			ebc.PnProxy.SetDefaultWaveformSync(1);
			// this._set_waveform(1);
		} else if (new_mode == 2){
			// bw
			this.bw_but_grayscale.visible = true;
			this.bw_but_bw_dither.visible = true;
			this.bw_but_bw.visible = true;
			this.bw_but_du4 = true;
			this.m_bw_slider.visible = true;
			this.mitem_bw_dither_invert.visible = true;
			// use A2 waveform
			// this._set_waveform(1);
			ebc.PnProxy.SetDefaultWaveformSync(1);
		} else if (new_mode == 3){
			// DU4 mode
			this.bw_but_grayscale.visible = true;
			this.bw_but_bw_dither.visible = true;
			this.bw_but_bw.visible = true;
			this.bw_but_du4 = true;
			this.m_bw_slider.visible = true;
			this.mitem_bw_dither_invert.visible = true;
			// use DU4 waveform
			ebc.PnProxy.SetDefaultWaveformSync(3);
		}

		// trigger a global refresh
		setTimeout(
			ebc.ebc_trigger_global_refresh,
			500
		);

	}

	_add_bw_buttons() {
		// add three buttons for grayscale, bw, bw+dithering modes

		// 1
		this.bw_but_grayscale = new PopupMenu.PopupMenuItem(_('Grayscale Mode'));
		this.bw_but_grayscale.connect('activate', () => {
			this._change_bw_mode(0);
		});
		this._indicator.menu.addMenuItem(this.bw_but_grayscale);

		// 2
		this.bw_but_bw_dither = new PopupMenu.PopupMenuItem(_('BW+Dither Mode'));
		this.bw_but_bw_dither.connect('activate', () => {
			this._change_bw_mode(1);
		});
		this._indicator.menu.addMenuItem(this.bw_but_bw_dither);

		// 3
		this.bw_but_bw = new PopupMenu.PopupMenuItem(_('BW Mode'));
		this.bw_but_bw.connect('activate', () => {
			this._change_bw_mode(2);
		});
		this._indicator.menu.addMenuItem(this.bw_but_bw);

		// 4
		this.bw_but_du4 = new PopupMenu.PopupMenuItem(_('DU4 Mode'));
		this.bw_but_du4.connect('activate', () => {
			this._change_bw_mode(3);
		});
		this._indicator.menu.addMenuItem(this.bw_but_du4);
	}

	_add_bw_slider() {
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
        this.m_bw_slider.add(icon);
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
		this._write_to_sysfs_file(
			'/sys/module/rockchip_ebc/parameters/default_waveform',
			1
		);
	}

	_set_waveform(waveform){
		this._write_to_sysfs_file(
			'/sys/module/rockchip_ebc/parameters/default_waveform',
			waveform
		);
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
		// 	this._set_waveform(2);
		// });
		// this._indicator.menu.addMenuItem(item);

		item = new PopupMenu.PopupMenuItem(_('GC16 Waveform'));
		item.connect('activate', () => {
			this._set_waveform(4);
		});
		this._indicator.menu.addMenuItem(item);

// 		item = new PopupMenu.PopupMenuItem(_('DU4 Waveform'));
// 		item.connect('activate', () => {
// 			this._set_waveform(7);
// 		});
// 		this._indicator.menu.addMenuItem(item);
	}

	_add_auto_refresh_button(){
		let filename = '/sys/module/rockchip_ebc/parameters/auto_refresh'
		let auto_refresh = this._get_content(filename);

		log(`add: auto refresh state: ${auto_refresh}`);

		if(auto_refresh == 'N'){
			this.mitem_auto_refresh = new PopupMenu.PopupMenuItem(_('Enable Autorefresh'));
		} else {
			this.mitem_auto_refresh = new PopupMenu.PopupMenuItem(_('Disable Autorefresh'));
		}
		this.mitem_auto_refresh.connect('activate', () => {
			this.toggle_auto_refresh();
		});

		this._indicator.menu.addMenuItem(this.mitem_auto_refresh);
	}

	toggle_auto_refresh(){
		log("Toggling atuo refresh");
		let filename = '/sys/module/rockchip_ebc/parameters/auto_refresh'
		let auto_refresh = this._get_content(filename);
		log(`toggle: auto refresh state: ${auto_refresh}`);

		if(auto_refresh == 'N'){
			auto_refresh = 1;
			this.mitem_auto_refresh.label.set_text('Disable Autorefresh');
		} else {
			auto_refresh = 0;
			this.mitem_auto_refresh.label.set_text('Enable Autorefresh');
		}

		this._write_to_sysfs_file(
			filename,
			auto_refresh
		);

	}

	_add_dither_invert_button(){
		this.mitem_bw_dither_invert = new PopupMenu.PopupMenuItem(_('BW Invert On'));
		let filename = '/sys/module/rockchip_ebc/parameters/bw_dither_invert'
		let bw_dither_invert = this._get_content(filename);

		if(bw_dither_invert == 'N'){
			this.mitem_bw_dither_invert.label.set_text('BW Invert On');
		} else {
			this.mitem_bw_dither_invert.label.set_text('BW Invert Off');
		}
		this.mitem_bw_dither_invert.connect('activate', () => {
			this.toggle_bw_dither_invert();
		});

		this._indicator.menu.addMenuItem(this.mitem_bw_dither_invert);
	}

	toggle_bw_dither_invert(){
		let filename = '/sys/module/rockchip_ebc/parameters/bw_dither_invert'
		let bw_dither_invert = this._get_content(filename);
		log(`Toggling dither invert (is: ${bw_dither_invert})`);

		if(bw_dither_invert == 0){
			bw_dither_invert = 1;
			this.mitem_bw_dither_invert.label.set_text('BW Invert Off');
		} else {
			bw_dither_invert = 0;
			this.mitem_bw_dither_invert.label.set_text('BW Invert On');
		}
		log(`new value: ${bw_dither_invert})`);

		this._write_to_sysfs_file(
			filename,
			bw_dither_invert
		);
	}

	add_refresh_button(){
		this._trigger_refresh_button = new TriggerRefreshButton();
		Main.panel.addToStatusArea(
			"PN Trigger Global Refresh",
			this._trigger_refresh_button,
			-1,
			'center'
		);
	}

	add_performance_mode_button(){
		this._performance_mode_button = new PerformanceModeButton();
		Main.panel.addToStatusArea(
			"PN Switch Performance Modes",
			this._performance_mode_button,
			-1,
			'center'
		);
	}

    add_warm_indicator_to_main_gnome_menu() {
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
		this._indicator2 = new QuickSettingsWarmSlider;
    }

    enable() {
        log(`enabling ${Me.metadata.name}`);

		this.add_refresh_button();
		this.add_performance_mode_button();
		this.add_warm_indicator_to_main_gnome_menu();

		// ////////////////////////////////////////////////////////////////////
		this._topBox = new St.BoxLayout({ });

		// Button 1
        let indicatorName = `${Me.metadata.name} Indicator`;

        // Create a panel button
        this._indicator = new PanelMenu.Button(0.0, indicatorName, false);

        // Add an icon
        let icon = new St.Icon({
            //gicon: new Gio.ThemedIcon({name: 'face-laugh-symbolic'}),
            gicon: new Gio.ThemedIcon({name: 'org.gnome.SimpleScan-symbolic'}),
            style_class: 'system-status-icon'
        });
        // this._indicator.add_child(icon);

		this._topBox.add(icon);

		this.panel_label = new St.Label({
			text: "DADA",
            y_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
		// Add the label
        // this._indicator.add_child(this.panel_label);
		this.dbus_proxy = ebc.ebc_subscribe_to_waveformchanged(this.onWaveformChanged, this.panel_label);

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

		this._add_bw_buttons();
		this._add_bw_slider();
		this._add_dither_invert_button();
		this._add_auto_refresh_button();
		this._add_waveform_buttons();
		this._add_testing_button();
		this._add_usb_mtp_gadget_buttons();

		// activate default grayscale mode
		this._change_bw_mode(0);

		// this._btpen = new btpen.Indicator_ng();
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
        log(`disabling ${Me.metadata.name}`);

		ebc.ebc_unsubscribe(this.dbus_proxy)

        this._indicator.destroy();
        this._indicator = null;

		this._trigger_refresh_button.destroy();
		this._trigger_refresh_button = null;

		this._performance_mode_button.destroy();
		this._performance_mode_button = null;

		this._indicator2.destroy();
        this._indicator2 = null;
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
        let target = Orientation[orientation];
        try {
            GLib.spawn_async(
                Me.path,
                ['gjs', `${Me.path}/rotator.js`, `${target}`],
                null,
                GLib.SpawnFlags.SEARCH_PATH,
                null);
        } catch (err) {
            logError(err);
        }
    }
}


function init() {
    log(`initializing ${Me.metadata.name}`);

    return new Extension();
}
