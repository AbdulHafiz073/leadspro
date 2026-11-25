using System;
using LeadHunter.Core.Entities;

namespace LeadHunter.Core.Services
{
    public static class LeadScoreEngine
    {
        /// <summary>
        /// Calculates the lead scoring priority from 0 to 100 based on digital presence and contact availability.
        /// </summary>
        public static int Calculate(Lead lead)
        {
            int score = 0;

            // +30 if website is missing or marked NoWebsite (Highest conversion potential for digital agencies)
            if (!lead.HasWebsite || lead.WebsiteStatus == WebsiteStatus.NoWebsite || string.IsNullOrWhiteSpace(lead.WebsiteUrl))
            {
                score += 30;
            }

            // +20 if phone number is available
            if (!string.IsNullOrWhiteSpace(lead.PhoneNumber))
            {
                score += 20;
            }

            // +15 if email is available
            if (!string.IsNullOrWhiteSpace(lead.Email))
            {
                score += 15;
            }

            // +10 if Google rating is 4.0 or above
            if (lead.Rating >= 4.0m)
            {
                score += 10;
            }

            // +10 if review count is 10 or above
            if (lead.ReviewCount >= 10)
            {
                score += 10;
            }

            // +10 if recently added within 7 days
            if ((DateTime.UtcNow - lead.CreatedAt).TotalDays <= 7.0)
            {
                score += 10;
            }

            // +5 if complete physical address is available
            if (!string.IsNullOrWhiteSpace(lead.Address) && 
                !string.IsNullOrWhiteSpace(lead.City) && 
                (!string.IsNullOrWhiteSpace(lead.PostalCode) || !string.IsNullOrWhiteSpace(lead.State)))
            {
                score += 5;
            }

            return Math.Clamp(score, 0, 100);
        }
    }
}
