import { Injectable } from '@angular/core';

export type HapticPattern = 'success' | 'error' | 'warning' | 'light' | 'medium' | 'heavy';

@Injectable({
  providedIn: 'root'
})
export class HapticService {
  private isSupported: boolean;
  private switchInput?: HTMLInputElement;
  private switchLabel?: HTMLLabelElement;
  private isIOS = false;

  constructor() {
    this.isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
                 (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    this.isSupported = 'vibrate' in navigator || this.isIOS;

    // Initialize iOS 18+ haptic workaround with hidden checkbox switch
    if (this.isIOS) {
      this.initializeIOSHaptic();
    }

    if (!this.isSupported) {
      console.log('⚠️ Haptic feedback not supported on this device');
    }
  }

  /**
   * iOS 18+ haptic workaround using hidden checkbox switch
   * Creates a hidden input[type="checkbox"][switch] and label
   */
  private initializeIOSHaptic(): void {
    try {
      // Create hidden checkbox with switch attribute
      this.switchInput = document.createElement('input');
      this.switchInput.type = 'checkbox';
      this.switchInput.setAttribute('switch', '');
      this.switchInput.id = 'haptic-switch';
      this.switchInput.style.cssText = `
        position: absolute;
        width: 1px;
        height: 1px;
        opacity: 0;
        pointer-events: none;
        left: -9999px;
      `;

      // Create label associated with the checkbox
      this.switchLabel = document.createElement('label');
      this.switchLabel.htmlFor = 'haptic-switch';
      this.switchLabel.style.cssText = `
        position: absolute;
        width: 1px;
        height: 1px;
        opacity: 0;
        pointer-events: none;
        left: -9999px;
      `;

      // Append to body
      document.body.appendChild(this.switchInput);
      document.body.appendChild(this.switchLabel);

      console.log('✅ iOS 18+ haptic initialized');
    } catch (error) {
      console.debug('Failed to initialize iOS haptic:', error);
    }
  }

  /**
   * Trigger iOS haptic by programmatically clicking the label
   * This toggles the checkbox and triggers Safari's haptic feedback
   */
  private triggerIOSHaptic(): void {
    if (!this.switchLabel || !this.switchInput) return;

    try {
      // Click the label (not the input directly)
      // This triggers Safari's haptic feedback
      this.switchLabel.click();
    } catch (error) {
      console.debug('Failed to trigger iOS haptic:', error);
    }
  }

  /**
   * Trigger haptic feedback with predefined patterns
   */
  vibrate(pattern: HapticPattern): void {
    if (!this.isSupported) {
      return;
    }

    // iOS uses checkbox switch workaround (simple tap only)
    if (this.isIOS) {
      this.triggerIOSHaptic();
      return;
    }

    // Android/Other platforms use Vibration API
    let vibrationPattern: number | number[];

    switch (pattern) {
      case 'success':
        // Double pulse for success
        vibrationPattern = [50, 50, 50];
        break;

      case 'error':
        // Longer vibration for error
        vibrationPattern = [100, 50, 100];
        break;

      case 'warning':
        // Single medium vibration
        vibrationPattern = 75;
        break;

      case 'light':
        // Very short tap
        vibrationPattern = 20;
        break;

      case 'medium':
        // Medium tap
        vibrationPattern = 50;
        break;

      case 'heavy':
        // Strong tap
        vibrationPattern = 80;
        break;

      default:
        vibrationPattern = 50;
    }

    try {
      navigator.vibrate(vibrationPattern);
    } catch (error) {
      console.error('Error triggering haptic feedback:', error);
    }
  }

  /**
   * Trigger custom vibration pattern
   */
  vibrateCustom(pattern: number | number[]): void {
    if (!this.isSupported) {
      return;
    }

    // iOS uses checkbox switch workaround (simple tap only)
    if (this.isIOS) {
      this.triggerIOSHaptic();
      return;
    }

    try {
      navigator.vibrate(pattern);
    } catch (error) {
      console.error('Error triggering custom haptic feedback:', error);
    }
  }

  /**
   * Cancel ongoing vibration
   */
  cancel(): void {
    if (!this.isSupported) {
      return;
    }

    try {
      navigator.vibrate(0);
    } catch (error) {
      console.error('Error canceling haptic feedback:', error);
    }
  }

  /**
   * Check if haptic feedback is supported
   */
  getIsSupported(): boolean {
    return this.isSupported;
  }

  /**
   * Vibrate for correct answer
   */
  correctAnswer(): void {
    this.vibrate('success');
  }

  /**
   * Vibrate for incorrect answer
   */
  incorrectAnswer(): void {
    this.vibrate('error');
  }

  /**
   * Vibrate for button press
   */
  buttonPress(): void {
    this.vibrate('light');
  }

  /**
   * Vibrate for selection
   */
  selection(): void {
    this.vibrate('medium');
  }
}
