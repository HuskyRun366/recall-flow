import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-terms',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './terms.component.html',
  styleUrls: ['./terms.component.scss']
})
export class TermsComponent {
  lastUpdated = '04. Dezember 2024';
  contactEmail = environment.dataProtection.contactEmail;
  contactName = environment.dataProtection.contactName
  contactCity = environment.dataProtection.city;
  contactZipCode = environment.dataProtection.zipCode
  contactCountry = environment.dataProtection.country;
}
