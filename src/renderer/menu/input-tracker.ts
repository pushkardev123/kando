//////////////////////////////////////////////////////////////////////////////////////////
//   _  _ ____ _  _ ___  ____                                                           //
//   |_/  |__| |\ | |  \ |  |    This file belongs to Kando, the cross-platform         //
//   | \_ |  | | \| |__/ |__|    pie menu. Read more on github.com/kando-menu/kando     //
//                                                                                      //
//////////////////////////////////////////////////////////////////////////////////////////

// SPDX-FileCopyrightText: Simon Schneegans <code@simonschneegans.de>
// SPDX-License-Identifier: MIT

import { EventEmitter } from 'events';

import * as math from '../math';
import { IVec2 } from '../../common';

/**
 * This is the threshold in pixels which is used to differentiate between a click and a
 * drag. If the mouse is moved more than this threshold before the mouse button is
 * released, the current mouse state is set to DRAGGING.
 */
const DRAG_THRESHOLD = 5;

/**
 * This enum is used to store the logical state of the input device. This will be set to
 * eClicked once the left mouse button is pressed. If the mouse is moved more than a
 * couple of pixels before the mouse button is released, it is set to eDragging. When the
 * mouse button is released, it is set to eReleased.
 *
 * At a higher level, Kando does not differentiate between mouse, touch and pen input.
 * This enum is used for all input devices. There is even the possibility of the "Turbo
 * Mode" which allows the user to select items by moving the mouse while a modifier key is
 * pressed. In this case, the mouse state will also be set to eDragging, even though the
 * mouse button is not pressed.
 */
export enum InputState {
  eReleased,
  eClicked,
  eDragging,
}

/**
 * This class is used to track the state of the input device. It stores the current state
 * (see InputState), the absolute mouse position, as well as the mouse position, distance,
 * and angle relative to the currently selected item.
 *
 * This class is an EventEmitter. It emits the following events:
 *
 * @fires pointer-motion - This event is emitted whenever the mouse moves. This first
 *   argument is the absolute mouse position. The second argument is a boolean which is
 *   true if the mouse is currently dragging an item. This is also true in turbo mode,
 *   when the mouse is moved while a keyboard key is pressed.
 */
export class InputTracker extends EventEmitter {
  /** See the documentation of the corresponding getters for more information. */
  private _state = InputState.eReleased;
  private _absolutePosition = { x: 0, y: 0 };
  private _relativePosition = { x: 0, y: 0 };
  private _angle = 0;
  private _distance = 0;
  private _deferredTurboMode = false;

  /**
   * The position where the mouse was when the user pressed the left mouse button the last
   * time.
   */
  private clickPosition = { x: 0, y: 0 };

  /**
   * If set to a value greater than 0, this will be decremented by 1 every time the the
   * mouse moves and the corresponding event is ignored. This is used to ignore the first
   * couple of mouse motion events after the menu is opened. See the documentation of the
   * reset() method for more information.
   */
  private ignoreMotionEvents = 0;

  /**
   * This is set to true if any key is pressed. If true, the menu will behave as if the
   * left mouse button is pressed.
   */
  private turboMode = false;

  /**
   * This will be set to CLICKED once the left mouse button is pressed. If the mouse is
   * moved more than DRAG_THRESHOLD pixels before the mouse button is released, this is
   * set to DRAGGING. When the mouse button is released, this is set to RELEASED.
   */
  public get state() {
    return this._state;
  }

  /**
   * The absolute mouse position is the position of the mouse in screen coordinates. It is
   * always updated when the mouse moves.
   */
  public get absolutePosition() {
    return this._absolutePosition;
  }

  /**
   * The relative mouse position is the position of the mouse relative to the currently
   * selected menu item. It is always updated when the mouse moves.
   */
  public get relativePosition() {
    return this._relativePosition;
  }

  /**
   * The mouse angle is the angle of the mouse relative to the currently selected menu
   * item. 0° is up, 90° is right, 180° is down and 270° is left. It is always updated
   * when the mouse moves.
   */
  public get angle() {
    return this._angle;
  }

  /**
   * This is the distance of the mouse to the center of the currently selected menu item.
   * It is always updated when the mouse moves.
   */
  public get distance() {
    return this._distance;
  }

  /**
   * If this is set to true, the turbo mode will be activated only after a key is pressed.
   * Else, the turbo mode will be activated immediately when the menu is opened and a key
   * is already pressed.
   */
  public set deferredTurboMode(val: boolean) {
    this._deferredTurboMode = val;
    this.turboMode = false;
  }

  /**
   * This method is called by the Menu class whenever the mouse pointer is moved or a
   * touch event is received. It updates the internal state of the InputTracker and emits
   * the pointer-motion event.
   *
   * @param event The mouse or touch event.
   * @param activeItemPosition The position of the currently selected menu item.
   */
  public onMotionEvent(event: MouseEvent | TouchEvent, activeItemPosition: IVec2) {
    // Ignore mouse motion events if requested.
    if (this.ignoreMotionEvents > 0) {
      this.ignoreMotionEvents--;
      return;
    }

    if (event instanceof MouseEvent) {
      this.update({ x: event.clientX, y: event.clientY }, activeItemPosition);
    } else {
      this.update(
        {
          x: event.touches[0].clientX,
          y: event.touches[0].clientY,
        },
        activeItemPosition
      );
    }

    // If the mouse moved too much, the current mousedown - mouseup event is not
    // considered to be a click anymore. Set the current mouse state to
    // InputState.eDragging.
    if (
      this._state === InputState.eClicked &&
      math.getDistance(this._absolutePosition, this.clickPosition) > DRAG_THRESHOLD
    ) {
      this._state = InputState.eDragging;
    }

    // If any key is pressed, this is handled basically as if the left mouse
    // button is pressed. This allows for menu item selections without having to press a
    // mouse button if the menu was opened with a keyboard shortcut.
    if (!this._deferredTurboMode) {
      this.turboMode =
        this.turboMode ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey;
    }

    if (this.turboMode) {
      this._state = InputState.eDragging;
    } else if (
      event instanceof MouseEvent &&
      this._state === InputState.eDragging &&
      event.buttons === 0
    ) {
      this._state = InputState.eReleased;
    }

    this.emit(
      'pointer-motion',
      this._absolutePosition,
      this._state === InputState.eDragging
    );
  }

  /**
   * This method is called by the Menu class whenever a mouse button is pressed or a touch
   * event is received. It updates the internal state of the InputTracker and also emits
   * the pointer-motion event.
   *
   * @param event The mouse or touch event.
   * @param activeItemPosition The position of the currently selected menu item.
   */
  public onPointerDownEvent(event: MouseEvent | TouchEvent, activeItemPosition: IVec2) {
    if (event instanceof MouseEvent) {
      this.clickPosition = { x: event.clientX, y: event.clientY };
    } else {
      this.clickPosition = {
        x: event.touches[0].clientX,
        y: event.touches[0].clientY,
      };
    }

    this._state = InputState.eClicked;

    this.onMotionEvent(event, activeItemPosition);
  }

  /**
   * This method is called by the Menu class whenever a mouse button is released or a
   * touch release event is received. It updates the internal state of the InputTracker.
   */
  public onPointerUpEvent() {
    this._state = InputState.eReleased;
  }

  /**
   * If any key is pressed, the turbo mode will be activated as long as turbo mode is not
   * deferred. In this case, a key has to be released first before the turbo mode will be
   * activated.
   *
   * @param event The keydown event.
   */
  public onKeyDownEvent() {
    if (!this._deferredTurboMode) {
      this.turboMode = true;
    }
  }

  /**
   * If the last key is released, the turbo mode will be deactivated.
   *
   * @param event The keyup event.
   */
  public onKeyUpEvent(event: KeyboardEvent) {
    const stillAnyModifierPressed =
      event.ctrlKey || event.metaKey || event.shiftKey || event.altKey;

    if (!stillAnyModifierPressed) {
      this._deferredTurboMode = false;
      this.turboMode = false;
    }
  }

  /**
   * Store the absolute mouse position, as well as the mouse position, distance, and angle
   * relative to the currently selected item.
   *
   * @param position The absolute mouse position.
   * @param activeItemPosition The position of the currently selected menu item. If this
   *   is not given, the menu item is assumed to be at the same position as the mouse.
   */
  public update(position: IVec2, activeItemPosition?: IVec2) {
    activeItemPosition = activeItemPosition || position;

    this._absolutePosition = position;
    this._relativePosition = math.subtract(position, activeItemPosition);
    this._distance = math.getLength(this._relativePosition);
    this._angle = math.getAngle(this._relativePosition);
  }

  /**
   * On some wayland compositors (for instance KWin), one or two initial mouse motion
   * events are sent containing wrong coordinates. They seem to be the coordinates of the
   * last mouse motion event over any XWayland surface before Kando's window was opened.
   * We simply ignore these events. This code is currently used on all platforms but I
   * think it's not an issue.
   */
  public ignoreNextMotionEvents() {
    this.ignoreMotionEvents = 2;
  }
}
