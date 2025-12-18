import { Component, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { ModeService } from '../../../core/services/mode.service';

/**
 * iOS-style segmented control for switching between Quiz and Lernen modes
 * Features smooth sliding background animation and accessibility support
 */
@Component({
  selector: 'app-mode-switch',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  templateUrl: './mode-switch.component.html',
  styleUrls: ['./mode-switch.component.scss']
})
export class ModeSwitchComponent {
  private modeService = inject(ModeService);

  isQuizMode = computed(() => this.modeService.isQuizMode());
  isLernenMode = computed(() => this.modeService.isLernenMode());

  async switchToQuiz(): Promise<void> {
    await this.modeService.setMode('quiz');
  }

  async switchToLernen(): Promise<void> {
    await this.modeService.setMode('lernen');
  }
}
