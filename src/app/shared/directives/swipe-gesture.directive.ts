import {
  Directive,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  Output,
  Renderer2,
  inject
} from '@angular/core';
import { HapticService } from '../../core/services/haptic.service';

export type SwipeDirection = 'left' | 'right' | 'up' | 'down';

@Directive({
  selector: '[appSwipeGesture]',
  standalone: true
})
export class SwipeGestureDirective {
  @Input() swipeThreshold = 50; // Minimum distance for swipe in pixels
  @Input() swipeVelocityThreshold = 0.3; // Minimum velocity for swipe
  @Input() swipeEnabled = true;
  @Output() swipeLeft = new EventEmitter<void>();
  @Output() swipeRight = new EventEmitter<void>();
  @Output() swipeUp = new EventEmitter<void>();
  @Output() swipeDown = new EventEmitter<void>();
  @Output() swipe = new EventEmitter<SwipeDirection>();

  private touchStartX = 0;
  private touchStartY = 0;
  private touchStartTime = 0;
  private touchEndX = 0;
  private touchEndY = 0;
  private touchEndTime = 0;
  private isSwiping = false;
  private hapticService = inject(HapticService);

  constructor(
    private el: ElementRef<HTMLElement>,
    private renderer: Renderer2
  ) {}

  @HostListener('touchstart', ['$event'])
  onTouchStart(event: TouchEvent): void {
    if (!this.swipeEnabled) return;

    this.touchStartX = event.touches[0].clientX;
    this.touchStartY = event.touches[0].clientY;
    this.touchStartTime = Date.now();
    this.isSwiping = true;

    // Add visual feedback
    this.renderer.setStyle(
      this.el.nativeElement,
      'transition',
      'transform 0.1s ease-out'
    );
  }

  @HostListener('touchmove', ['$event'])
  onTouchMove(event: TouchEvent): void {
    if (!this.isSwiping || !this.swipeEnabled) return;

    const currentX = event.touches[0].clientX;
    const currentY = event.touches[0].clientY;
    const deltaX = currentX - this.touchStartX;
    const deltaY = currentY - this.touchStartY;

    // Only show visual feedback for horizontal swipes
    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      // Prevent vertical scrolling during horizontal swipe
      event.preventDefault();

      // Apply elastic resistance effect (swipe moves slower)
      const resistance = 0.3;
      const translateX = deltaX * resistance;

      this.renderer.setStyle(
        this.el.nativeElement,
        'transform',
        `translateX(${translateX}px)`
      );

      // Add opacity fade effect
      const opacity = 1 - Math.abs(deltaX) / 500;
      this.renderer.setStyle(
        this.el.nativeElement,
        'opacity',
        Math.max(opacity, 0.7).toString()
      );
    }
  }

  @HostListener('touchend', ['$event'])
  onTouchEnd(event: TouchEvent): void {
    if (!this.isSwiping || !this.swipeEnabled) return;

    this.touchEndX = event.changedTouches[0].clientX;
    this.touchEndY = event.changedTouches[0].clientY;
    this.touchEndTime = Date.now();

    // Reset styles with smooth transition
    this.renderer.setStyle(
      this.el.nativeElement,
      'transition',
      'transform 0.3s ease-out, opacity 0.3s ease-out'
    );
    this.renderer.setStyle(this.el.nativeElement, 'transform', 'translateX(0)');
    this.renderer.setStyle(this.el.nativeElement, 'opacity', '1');

    this.detectSwipe();
    this.isSwiping = false;
  }

  @HostListener('touchcancel', ['$event'])
  onTouchCancel(): void {
    if (!this.swipeEnabled) return;

    // Reset styles
    this.renderer.setStyle(
      this.el.nativeElement,
      'transition',
      'transform 0.3s ease-out, opacity 0.3s ease-out'
    );
    this.renderer.setStyle(this.el.nativeElement, 'transform', 'translateX(0)');
    this.renderer.setStyle(this.el.nativeElement, 'opacity', '1');

    this.isSwiping = false;
  }

  private detectSwipe(): void {
    const deltaX = this.touchEndX - this.touchStartX;
    const deltaY = this.touchEndY - this.touchStartY;
    const deltaTime = this.touchEndTime - this.touchStartTime;

    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    // Calculate velocity (pixels per millisecond)
    const velocity = Math.max(absX, absY) / deltaTime;

    // Determine if it's a valid swipe
    const isSwipe =
      (absX > this.swipeThreshold || absY > this.swipeThreshold) &&
      velocity > this.swipeVelocityThreshold;

    if (!isSwipe) return;

    // Determine swipe direction
    if (absX > absY) {
      // Horizontal swipe
      if (deltaX > 0) {
        this.swipeRight.emit();
        this.swipe.emit('right');
        this.triggerHapticFeedback();
      } else {
        this.swipeLeft.emit();
        this.swipe.emit('left');
        this.triggerHapticFeedback();
      }
    } else {
      // Vertical swipe
      if (deltaY > 0) {
        this.swipeDown.emit();
        this.swipe.emit('down');
      } else {
        this.swipeUp.emit();
        this.swipe.emit('up');
      }
    }
  }

  private triggerHapticFeedback(): void {
    // Use HapticService for both iOS and Android
    this.hapticService.vibrate('light');
  }
}
