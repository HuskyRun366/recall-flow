import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-privacy',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './privacy.component.html',
  styleUrls: ['./privacy.component.scss']
})
export class PrivacyComponent {
  lastUpdated = '04. Dezember 2024';
  contactEmail = environment.dataProtection.contactEmail;
  contactName = environment.dataProtection.contactName;
  contactCity = environment.dataProtection.city;
  contactZipCode = environment.dataProtection.zipCode;
  contactCountry = environment.dataProtection.country;
}
