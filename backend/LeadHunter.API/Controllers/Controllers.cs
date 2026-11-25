using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using LeadHunter.Core.Entities;
using LeadHunter.Core.Services;
using LeadHunter.Infrastructure.Data;
using LeadHunter.Infrastructure.Services;
using LeadHunter.Jobs;

namespace LeadHunter.API.Controllers
{
    // ==========================================
    // 1. AUTH CONTROLLER
    // ==========================================
    [ApiController]
    [Route("api/[controller]")]
    public class AuthController : ControllerBase
    {
        private readonly ApplicationDbContext _db;
        public AuthController(ApplicationDbContext db) => _db = db;

        [HttpPost("register")]
        public async Task<IActionResult> Register([FromBody] RegisterRequest req)
        {
            if (await _db.Users.AnyAsync(u => u.Email == req.Email))
                return BadRequest(new { message = "Email already registered." });

            var user = new User
            {
                Email = req.Email,
                FullName = req.FullName,
                PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.Password),
                Role = UserRole.User,
                CreatedAt = DateTime.UtcNow,
                IsActive = true
            };
            _db.Users.Add(user);
            await _db.SaveChangesAsync();

            return Ok(new { token = "jwt_access_token_bearer_sample", user });
        }

        [HttpPost("login")]
        public async Task<IActionResult> Login([FromBody] LoginRequest req)
        {
            var user = await _db.Users.FirstOrDefaultAsync(u => u.Email == req.Email);
            if (user == null || !BCrypt.Net.BCrypt.Verify(req.Password, user.PasswordHash))
                return Unauthorized(new { message = "Invalid email or credentials." });

            return Ok(new { token = "jwt_access_token_bearer_sample", user });
        }

        [HttpGet("me")]
        [Authorize]
        public async Task<IActionResult> GetCurrentUser()
        {
            var user = await _db.Users.FirstOrDefaultAsync();
            return Ok(user);
        }
    }

    public record RegisterRequest(string FullName, string Email, string Password);
    public record LoginRequest(string Email, string Password);

    // ==========================================
    // 2. COUNTRIES CONTROLLER
    // ==========================================
    [ApiController]
    [Route("api/[controller]")]
    public class CountriesController : ControllerBase
    {
        private readonly ApplicationDbContext _db;
        public CountriesController(ApplicationDbContext db) => _db = db;

        [HttpGet]
        public async Task<IActionResult> GetAll()
        {
            var countries = await _db.Countries.Where(c => c.IsActive).ToListAsync();
            return Ok(countries);
        }

        [HttpGet("{id}")]
        public async Task<IActionResult> GetById(int id)
        {
            var country = await _db.Countries.FindAsync(id);
            if (country == null) return NotFound();
            return Ok(country);
        }

        [HttpPost]
        [Authorize(Roles = "Admin")]
        public async Task<IActionResult> Create([FromBody] Country country)
        {
            _db.Countries.Add(country);
            await _db.SaveChangesAsync();
            return CreatedAtAction(nameof(GetById), new { id = country.Id }, country);
        }

        [HttpPut("{id}")]
        [Authorize(Roles = "Admin")]
        public async Task<IActionResult> Update(int id, [FromBody] Country country)
        {
            var existing = await _db.Countries.FindAsync(id);
            if (existing == null) return NotFound();
            existing.Name = country.Name;
            existing.Code = country.Code;
            existing.IsActive = country.IsActive;
            await _db.SaveChangesAsync();
            return Ok(existing);
        }
    }

    // ==========================================
    // 3. LEADS CONTROLLER
    // ==========================================
    [ApiController]
    [Route("api/[controller]")]
    public class LeadsController : ControllerBase
    {
        private readonly ApplicationDbContext _db;
        public LeadsController(ApplicationDbContext db) => _db = db;

        [HttpGet]
        public async Task<IActionResult> GetLeads(
            [FromQuery] int? countryId,
            [FromQuery] string? category,
            [FromQuery] bool? hasWebsite,
            [FromQuery] int page = 1,
            [FromQuery] int pageSize = 20)
        {
            var query = _db.Leads.AsQueryable();

            if (countryId.HasValue)
                query = query.Where(l => l.CountryId == countryId.Value);

            if (!string.IsNullOrEmpty(category) && category != "all")
                query = query.Where(l => l.Category == category);

            if (hasWebsite.HasValue)
                query = query.Where(l => l.HasWebsite == hasWebsite.Value);

            var total = await query.CountAsync();
            var items = await query
                .OrderByDescending(l => l.LeadScore)
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .ToListAsync();

            return Ok(new { total, page, pageSize, items });
        }

        [HttpGet("{id}")]
        public async Task<IActionResult> GetById(long id)
        {
            var lead = await _db.Leads.Include(l => l.Country).FirstOrDefaultAsync(l => l.Id == id);
            if (lead == null) return NotFound();
            return Ok(lead);
        }

        [HttpPost]
        public async Task<IActionResult> Create([FromBody] Lead lead)
        {
            lead.CreatedAt = DateTime.UtcNow;
            lead.UpdatedAt = DateTime.UtcNow;
            lead.LeadScore = LeadScoreEngine.Calculate(lead);
            _db.Leads.Add(lead);
            await _db.SaveChangesAsync();
            return CreatedAtAction(nameof(GetById), new { id = lead.Id }, lead);
        }

        [HttpPut("{id}")]
        public async Task<IActionResult> Update(long id, [FromBody] Lead lead)
        {
            var existing = await _db.Leads.FindAsync(id);
            if (existing == null) return NotFound();

            existing.BusinessName = lead.BusinessName;
            existing.ContactPerson = lead.ContactPerson;
            existing.Email = lead.Email;
            existing.PhoneNumber = lead.PhoneNumber;
            existing.WhatsAppNumber = lead.WhatsAppNumber;
            existing.WebsiteUrl = lead.WebsiteUrl;
            existing.HasWebsite = !string.IsNullOrWhiteSpace(lead.WebsiteUrl);
            existing.WebsiteStatus = lead.WebsiteStatus;
            existing.Address = lead.Address;
            existing.City = lead.City;
            existing.State = lead.State;
            existing.PostalCode = lead.PostalCode;
            existing.LeadScore = LeadScoreEngine.Calculate(existing);
            existing.UpdatedAt = DateTime.UtcNow;

            await _db.SaveChangesAsync();
            return Ok(existing);
        }

        [HttpDelete("{id}")]
        public async Task<IActionResult> Delete(long id)
        {
            var lead = await _db.Leads.FindAsync(id);
            if (lead == null) return NotFound();
            _db.Leads.Remove(lead);
            await _db.SaveChangesAsync();
            return Ok(new { message = "Lead deleted successfully" });
        }

        [HttpPost("select")]
        public async Task<IActionResult> Select([FromBody] List<long> leadIds)
        {
            await _db.Leads.Where(l => leadIds.Contains(l.Id))
                .ExecuteUpdateAsync(s => s.SetProperty(l => l.IsSelected, true));
            return Ok(new { selected = leadIds.Count });
        }

        [HttpPost("unselect")]
        public async Task<IActionResult> Unselect([FromBody] List<long> leadIds)
        {
            await _db.Leads.Where(l => leadIds.Contains(l.Id))
                .ExecuteUpdateAsync(s => s.SetProperty(l => l.IsSelected, false));
            return Ok(new { unselected = leadIds.Count });
        }

        [HttpPost("select-all")]
        public async Task<IActionResult> SelectAll()
        {
            await _db.Leads.ExecuteUpdateAsync(s => s.SetProperty(l => l.IsSelected, true));
            return Ok(new { message = "All leads selected." });
        }

        [HttpPost("unselect-all")]
        public async Task<IActionResult> UnselectAll()
        {
            await _db.Leads.ExecuteUpdateAsync(s => s.SetProperty(l => l.IsSelected, false));
            return Ok(new { message = "All leads unselected." });
        }

        [HttpGet("export")]
        public async Task<IActionResult> Export([FromQuery] string format = "csv")
        {
            var leads = await _db.Leads.Take(1000).ToListAsync();
            var sb = new StringBuilder();
            sb.AppendLine("Id,BusinessName,Category,City,Phone,Email,HasWebsite,LeadScore");
            foreach (var l in leads)
            {
                sb.AppendLine($"{l.Id},\"{l.BusinessName}\",\"{l.Category}\",\"{l.City}\",\"{l.PhoneNumber}\",\"{l.Email}\",{l.HasWebsite},{l.LeadScore}");
            }
            return File(Encoding.UTF8.GetBytes(sb.ToString()), "text/csv", $"leads_export_{DateTime.UtcNow:yyyyMMdd}.csv");
        }
    }

    // ==========================================
    // 4. DAILY FETCH CONTROLLER
    // ==========================================
    [ApiController]
    [Route("api/fetch")]
    public class DailyFetchController : ControllerBase
    {
        private readonly ApplicationDbContext _db;
        private readonly DailyLeadFetchJob _fetchJob;

        public DailyFetchController(ApplicationDbContext db, DailyLeadFetchJob fetchJob)
        {
            _db = db;
            _fetchJob = fetchJob;
        }

        [HttpPost("run-now")]
        public async Task<IActionResult> RunNow()
        {
            await _fetchJob.ExecuteAsync();
            return Ok(new { status = "DailyLeadFetchJob completed successfully" });
        }

        [HttpGet("logs")]
        public async Task<IActionResult> GetLogs()
        {
            var logs = await _db.DailyFetchLogs.OrderByDescending(l => l.StartedAt).Take(50).ToListAsync();
            return Ok(logs);
        }

        [HttpGet("status")]
        public IActionResult GetStatus()
        {
            return Ok(new
            {
                scheduler = "Hangfire Server Online",
                nextRun = DateTime.UtcNow.Date.AddDays(1),
                jobsActive = 3
            });
        }
    }

    // ==========================================
    // 5. OUTREACH CONTROLLER
    // ==========================================
    [ApiController]
    [Route("api/[controller]")]
    public class OutreachController : ControllerBase
    {
        private readonly ApplicationDbContext _db;
        private readonly IOutreachDispatcher _dispatcher;

        public OutreachController(ApplicationDbContext db, IOutreachDispatcher dispatcher)
        {
            _db = db;
            _dispatcher = dispatcher;
        }

        [HttpPost("send")]
        public async Task<IActionResult> SendOutreach([FromBody] SendOutreachRequest req)
        {
            var template = await _db.OutreachTemplates.FindAsync(req.TemplateId);
            if (template == null) return BadRequest("Template not found");

            var leads = await _db.Leads.Where(l => req.LeadIds.Contains(l.Id)).ToListAsync();
            int success = 0;
            int failed = 0;

            foreach (var lead in leads)
            {
                var body = template.Body
                    .Replace("{BusinessName}", lead.BusinessName)
                    .Replace("{City}", lead.City)
                    .Replace("{Category}", lead.Category);

                var (ok, error) = await _dispatcher.SendAsync(lead, req.Channel, template.Subject ?? "", body);

                _db.OutreachLogs.Add(new OutreachLog
                {
                    LeadId = lead.Id,
                    UserId = 1,
                    Channel = req.Channel,
                    MessageBody = body,
                    Status = ok ? OutreachDeliveryStatus.Sent : OutreachDeliveryStatus.Failed,
                    SentAt = DateTime.UtcNow,
                    ErrorMessage = error
                });

                if (ok) success++; else failed++;
            }

            await _db.SaveChangesAsync();
            return Ok(new { total = leads.Count, success, failed });
        }

        [HttpGet("logs")]
        public async Task<IActionResult> GetLogs()
        {
            var logs = await _db.OutreachLogs.OrderByDescending(l => l.SentAt).Take(100).ToListAsync();
            return Ok(logs);
        }

        [HttpGet("templates")]
        public async Task<IActionResult> GetTemplates()
        {
            var tpls = await _db.OutreachTemplates.ToListAsync();
            return Ok(tpls);
        }

        [HttpPost("templates")]
        public async Task<IActionResult> CreateTemplate([FromBody] OutreachTemplate tpl)
        {
            _db.OutreachTemplates.Add(tpl);
            await _db.SaveChangesAsync();
            return Ok(tpl);
        }

        [HttpPut("templates/{id}")]
        public async Task<IActionResult> UpdateTemplate(int id, [FromBody] OutreachTemplate tpl)
        {
            var existing = await _db.OutreachTemplates.FindAsync(id);
            if (existing == null) return NotFound();
            existing.Name = tpl.Name;
            existing.Channel = tpl.Channel;
            existing.Subject = tpl.Subject;
            existing.Body = tpl.Body;
            await _db.SaveChangesAsync();
            return Ok(existing);
        }

        [HttpDelete("templates/{id}")]
        public async Task<IActionResult> DeleteTemplate(int id)
        {
            var existing = await _db.OutreachTemplates.FindAsync(id);
            if (existing == null) return NotFound();
            _db.OutreachTemplates.Remove(existing);
            await _db.SaveChangesAsync();
            return Ok(new { message = "Template deleted." });
        }
    }

    public record SendOutreachRequest(List<long> LeadIds, OutreachChannel Channel, int TemplateId);

    // ==========================================
    // 6. DASHBOARD CONTROLLER
    // ==========================================
    [ApiController]
    [Route("api/[controller]")]
    public class DashboardController : ControllerBase
    {
        private readonly ApplicationDbContext _db;
        public DashboardController(ApplicationDbContext db) => _db = db;

        [HttpGet("stats")]
        public async Task<IActionResult> GetStats()
        {
            var totalLeads = await _db.Leads.CountAsync();
            var noWebsite = await _db.Leads.CountAsync(l => !l.HasWebsite || l.WebsiteStatus == WebsiteStatus.NoWebsite);
            var highScore = await _db.Leads.CountAsync(l => l.LeadScore >= 75);
            var totalOutreach = await _db.OutreachLogs.CountAsync();

            return Ok(new
            {
                totalLeads,
                noWebsite,
                highScore,
                totalOutreach
            });
        }

        [HttpGet("daily-chart")]
        public async Task<IActionResult> GetDailyChart([FromQuery] int days = 30)
        {
            var logs = await _db.DailyFetchLogs.OrderByDescending(l => l.FetchDate).Take(days).ToListAsync();
            return Ok(logs);
        }
    }
}
