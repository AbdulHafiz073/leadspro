using System;
using System.Linq;
using System.Net.Http;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using LeadHunter.Core.Entities;
using LeadHunter.Core.Services;
using LeadHunter.Infrastructure.Data;
using LeadHunter.Infrastructure.Services;

namespace LeadHunter.Jobs
{
    /// <summary>
    /// Job 1: DailyLeadFetchJob - Runs Daily at 12:00 AM server time
    /// 1. Har active country ke liye loop kare
    /// 2. Google Places API call kare (category-wise)
    /// 3. Naye leads database mein insert kare
    /// 4. Duplicate check: GooglePlaceId se
    /// 5. LeadScore calculate kare
    /// 6. DailyFetchLogs mein entry kare
    /// </summary>
    public class DailyLeadFetchJob
    {
        private readonly ApplicationDbContext _db;
        private readonly IGooglePlacesService _placesService;
        private readonly ILogger<DailyLeadFetchJob> _logger;

        public DailyLeadFetchJob(
            ApplicationDbContext db,
            IGooglePlacesService placesService,
            ILogger<DailyLeadFetchJob> logger)
        {
            _db = db;
            _placesService = placesService;
            _logger = logger;
        }

        public async Task ExecuteAsync()
        {
            _logger.LogInformation("Job 1: DailyLeadFetchJob started at {Time}", DateTime.UtcNow);
            var activeCountries = await _db.Countries.Where(c => c.IsActive).ToListAsync();
            var categories = new[] { "restaurant", "plumber", "dentist", "auto repair", "real estate", "law firm", "gym" };

            foreach (var country in activeCountries)
            {
                var startedAt = DateTime.UtcNow;
                int addedCount = 0;

                try
                {
                    foreach (var category in categories)
                    {
                        var fetchedLeads = await _placesService.FetchLeadsByCountryAndCategoryAsync(country, category);
                        foreach (var lead in fetchedLeads)
                        {
                            if (!string.IsNullOrEmpty(lead.GooglePlaceId) &&
                                await _db.Leads.AnyAsync(l => l.GooglePlaceId == lead.GooglePlaceId))
                            {
                                continue; // Duplicate check
                            }

                            lead.LeadScore = LeadScoreEngine.Calculate(lead);
                            _db.Leads.Add(lead);
                            addedCount++;
                        }
                    }

                    await _db.SaveChangesAsync();

                    _db.DailyFetchLogs.Add(new DailyFetchLog
                    {
                        FetchDate = DateTime.UtcNow.Date,
                        CountryId = country.Id,
                        LeadsAdded = addedCount,
                        Status = "Success",
                        StartedAt = startedAt,
                        CompletedAt = DateTime.UtcNow
                    });
                    await _db.SaveChangesAsync();
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "DailyLeadFetchJob error for country {Country}", country.Name);
                    _db.DailyFetchLogs.Add(new DailyFetchLog
                    {
                        FetchDate = DateTime.UtcNow.Date,
                        CountryId = country.Id,
                        LeadsAdded = addedCount,
                        Status = "Failed",
                        StartedAt = startedAt,
                        CompletedAt = DateTime.UtcNow,
                        ErrorMessage = ex.Message
                    });
                    await _db.SaveChangesAsync();
                }
            }
            _logger.LogInformation("Job 1: DailyLeadFetchJob finished successfully");
        }
    }

    /// <summary>
    /// Job 2: WebsiteStatusCheckJob - Runs Daily at 2:00 AM
    /// 1. Har lead ka website check kare
    /// 2. Agar website nahi hai -> WebsiteStatus = NoWebsite
    /// 3. Agar website hai lekin slow/outdated -> NeedsUpdate
    /// 4. LastCheckedAt update kare
    /// </summary>
    public class WebsiteStatusCheckJob
    {
        private readonly ApplicationDbContext _db;
        private readonly HttpClient _httpClient;
        private readonly ILogger<WebsiteStatusCheckJob> _logger;

        public WebsiteStatusCheckJob(ApplicationDbContext db, HttpClient httpClient, ILogger<WebsiteStatusCheckJob> logger)
        {
            _db = db;
            _httpClient = httpClient;
            _logger = logger;
        }

        public async Task ExecuteAsync()
        {
            _logger.LogInformation("Job 2: WebsiteStatusCheckJob started at {Time}", DateTime.UtcNow);
            var leads = await _db.Leads.Take(500).ToListAsync();

            foreach (var lead in leads)
            {
                lead.LastCheckedAt = DateTime.UtcNow;

                if (string.IsNullOrWhiteSpace(lead.WebsiteUrl) || !lead.HasWebsite)
                {
                    lead.WebsiteStatus = WebsiteStatus.NoWebsite;
                    lead.HasWebsite = false;
                }
                else
                {
                    try
                    {
                        using var cts = new System.Threading.CancellationTokenSource(TimeSpan.FromSeconds(5));
                        var response = await _httpClient.GetAsync(lead.WebsiteUrl, HttpCompletionOption.ResponseHeadersRead, cts.Token);
                        if (!response.IsSuccessStatusCode)
                        {
                            lead.WebsiteStatus = WebsiteStatus.NeedsUpdate;
                        }
                    }
                    catch
                    {
                        lead.WebsiteStatus = WebsiteStatus.NeedsUpdate;
                    }
                }

                // Recalculate score
                lead.LeadScore = LeadScoreEngine.Calculate(lead);
            }

            await _db.SaveChangesAsync();
            _logger.LogInformation("Job 2: WebsiteStatusCheckJob finished");
        }
    }

    /// <summary>
    /// Job 3: EmailEnrichmentJob - Runs Daily at 3:00 AM
    /// 1. Jinke paas email nahi hai, unke liye Hunter.io call kare
    /// 2. Email mila toh update kare
    /// </summary>
    public class EmailEnrichmentJob
    {
        private readonly ApplicationDbContext _db;
        private readonly IHunterIoService _hunterService;
        private readonly ILogger<EmailEnrichmentJob> _logger;

        public EmailEnrichmentJob(ApplicationDbContext db, IHunterIoService hunterService, ILogger<EmailEnrichmentJob> logger)
        {
            _db = db;
            _hunterService = hunterService;
            _logger = logger;
        }

        public async Task ExecuteAsync()
        {
            _logger.LogInformation("Job 3: EmailEnrichmentJob started at {Time}", DateTime.UtcNow);
            var missingEmailLeads = await _db.Leads
                .Where(l => string.IsNullOrEmpty(l.Email) && !string.IsNullOrEmpty(l.WebsiteUrl))
                .Take(100)
                .ToListAsync();

            foreach (var lead in missingEmailLeads)
            {
                try
                {
                    var uri = new Uri(lead.WebsiteUrl!);
                    var domain = uri.Host.Replace("www.", "");
                    var discoveredEmail = await _hunterService.FindEmailForDomainAsync(domain, lead.BusinessName);
                    if (!string.IsNullOrEmpty(discoveredEmail))
                    {
                        lead.Email = discoveredEmail;
                        lead.LeadScore = LeadScoreEngine.Calculate(lead);
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to enrich email for lead {LeadId}", lead.Id);
                }
            }

            await _db.SaveChangesAsync();
            _logger.LogInformation("Job 3: EmailEnrichmentJob finished");
        }
    }
}
