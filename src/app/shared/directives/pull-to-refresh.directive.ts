import {
  Directive,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnDestroy,
  OnInit,
  Output,
  Renderer2
} from '@angular/core';

@Directive({
  selector: '[appPullToRefresh]',
  standalone: true
})
export class PullToRefreshDirective implements OnInit, OnDestroy {
  @Input() pullToRefreshEnabled = true;
  @Input() pullThreshold = 80; // pixels to pull before triggering refresh
  @Output() refresh = new EventEmitter<void>();

  private startY = 0;
  private currentY = 0;
  private isPulling = false;
  private pullIndicator: HTMLElement | null = null;
  private originalScroll = 0;

  constructor(
    private el: ElementRef<HTMLElement>,
    private renderer: Renderer2
  ) {}

  ngOnInit(): void {
    if (this.pullToRefreshEnabled) {
      this.createPullIndicator();
    }
  }

  ngOnDestroy(): void {
    if (this.pullIndicator && this.pullIndicator.parentNode) {
      this.pullIndicator.parentNode.removeChild(this.pullIndicator);
    }
  }

  private createPullIndicator(): void {
    this.pullIndicator = this.renderer.createElement('div');
    this.renderer.addClass(this.pullIndicator, 'pull-to-refresh-indicator');
    this.renderer.setStyle(this.pullIndicator, 'position', 'absolute');
    this.renderer.setStyle(this.pullIndicator, 'top', '-60px');
    this.renderer.setStyle(this.pullIndicator, 'left', '50%');
    this.renderer.setStyle(this.pullIndicator, 'transform', 'translateX(-50%)');
    this.renderer.setStyle(this.pullIndicator, 'width', '40px');
    this.renderer.setStyle(this.pullIndicator, 'height', '40px');
    this.renderer.setStyle(this.pullIndicator, 'display', 'flex');
    this.renderer.setStyle(this.pullIndicator, 'align-items', 'center');
    this.renderer.setStyle(this.pullIndicator, 'justify-content', 'center');
    this.renderer.setStyle(this.pullIndicator, 'opacity', '0');
    this.renderer.setStyle(this.pullIndicator, 'transition', 'opacity 0.2s');
    this.renderer.setStyle(this.pullIndicator, 'z-index', '1000');

    // Add spinner icon
    const spinner = this.renderer.createElement('div');
    this.renderer.addClass(spinner, 'spinner-border');
    this.renderer.setStyle(spinner, 'width', '32px');
    this.renderer.setStyle(spinner, 'height', '32px');
    this.renderer.setStyle(spinner, 'border', '3px solid rgba(var(--color-primary-rgb, 25, 118, 210), 0.3)');
    this.renderer.setStyle(spinner, 'border-top-color', 'var(--color-primary)');
    this.renderer.setStyle(spinner, 'border-radius', '50%');
    this.renderer.setStyle(spinner, 'animation', 'spin 0.8s linear infinite');

    this.renderer.appendChild(this.pullIndicator, spinner);

    // Insert at the beginning of the element
    const parent = this.el.nativeElement;
    this.renderer.setStyle(parent, 'position', 'relative');
    this.renderer.insertBefore(parent, this.pullIndicator, parent.firstChild);
  }

  @HostListener('touchstart', ['$event'])
  onTouchStart(event: TouchEvent): void {
    if (!this.pullToRefreshEnabled) return;

    const windowScrollY = window.scrollY || window.pageYOffset;
    const docScrollTop = document.documentElement.scrollTop || document.body.scrollTop;

    // Only enable pull-to-refresh when at the VERY TOP of the page (not element scroll)
    // This ensures it only works when pulling from the top, not when scrolling in the list
    if (windowScrollY === 0 && docScrollTop === 0) {
      this.startY = event.touches[0].clientY;
      this.isPulling = true;
    }
  }

  @HostListener('touchmove', ['$event'])
  onTouchMove(event: TouchEvent): void {
    if (!this.isPulling || !this.pullToRefreshEnabled) return;

    this.currentY = event.touches[0].clientY;
    const diff = this.currentY - this.startY;
    const windowScrollY = window.scrollY || window.pageYOffset;
    const docScrollTop = document.documentElement.scrollTop || document.body.scrollTop;

    // Only allow pull when page is at top AND user is pulling down
    if (diff > 0 && windowScrollY === 0 && docScrollTop === 0) {
      // Prevent default scroll behavior when pulling down
      event.preventDefault();

      // Update indicator opacity based on pull distance
      if (this.pullIndicator) {
        const opacity = Math.min(diff / this.pullThreshold, 1);
        this.renderer.setStyle(this.pullIndicator, 'opacity', opacity.toString());
        this.renderer.setStyle(this.pullIndicator, 'top', `${-60 + diff * 0.5}px`);
      }

      // Show visual feedback on the body/document, not just the element
      this.renderer.setStyle(
        this.el.nativeElement,
        'transform',
        `translateY(${Math.min(diff * 0.4, this.pullThreshold * 0.4)}px)`
      );
      this.renderer.setStyle(this.el.nativeElement, 'transition', 'none');
    } else if (diff < 0 || windowScrollY > 0 || docScrollTop > 0) {
      // Cancel pulling if user scrolls down or page is not at top
      this.isPulling = false;
    }
  }

  @HostListener('touchend', ['$event'])
  onTouchEnd(event: TouchEvent): void {
    if (!this.isPulling || !this.pullToRefreshEnabled) return;

    const diff = this.currentY - this.startY;

    // Reset styles
    this.renderer.setStyle(this.el.nativeElement, 'transition', 'transform 0.3s ease');
    this.renderer.setStyle(this.el.nativeElement, 'transform', 'translateY(0)');

    if (this.pullIndicator) {
      setTimeout(() => {
        if (this.pullIndicator) {
          this.renderer.setStyle(this.pullIndicator, 'opacity', '0');
          this.renderer.setStyle(this.pullIndicator, 'top', '-60px');
        }
      }, 300);
    }

    // Trigger refresh if pulled enough
    if (diff > this.pullThreshold) {
      this.triggerRefresh();
    }

    this.isPulling = false;
    this.startY = 0;
    this.currentY = 0;
  }

  private triggerRefresh(): void {
    // Add haptic feedback if supported
    if ('vibrate' in navigator) {
      navigator.vibrate(50);
    }

    this.refresh.emit();
  }
}
