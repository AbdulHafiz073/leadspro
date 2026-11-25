using System;
using System.Text;
using Hangfire;
using Hangfire.MySql;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Builder;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.IdentityModel.Tokens;
using Serilog;
using LeadHunter.Infrastructure.Data;
using LeadHunter.Infrastructure.Services;
using LeadHunter.Jobs;

var builder = WebApplication.CreateBuilder(args);

// Configure Serilog Logger
Log.Logger = new LoggerConfiguration()
    .ReadFrom.Configuration(builder.Configuration)
    .Enrich.FromLogContext()
    .WriteTo.Console()
    .WriteTo.File("logs/leadhunter-.log", rollingInterval: RollingInterval.Day)
    .CreateLogger();

builder.Host.UseSerilog();

// Add Database Context (MySQL 8.0 with Pomelo)
var connectionString = builder.Configuration.GetConnectionString("DefaultConnection") 
    ?? "Server=localhost;Port=3306;Database=leadhunterpro;User=root;Password=root_password;";

builder.Services.AddDbContext<ApplicationDbContext>(options =>
    options.UseMySql(connectionString, ServerVersion.AutoDetect(connectionString)));

// Add Hangfire Services
builder.Services.AddHangfire(configuration => configuration
    .SetDataCompatibilityLevel(CompatibilityLevel.Version_180)
    .UseSimpleAssemblyNameTypeSerializer()
    .UseRecommendedSerializerSettings()
    .UseStorage(new MySqlStorage(connectionString, new MySqlStorageOptions
    {
        QueuePollInterval = TimeSpan.FromSeconds(15),
        JobExpirationCheckInterval = TimeSpan.FromHours(1),
        CountersAggregateInterval = TimeSpan.FromMinutes(5),
        PrepareSchemaIfNecessary = true,
        DashboardJobListLimit = 50000,
        TransactionTimeout = TimeSpan.FromMinutes(1),
        TablesPrefix = "Hangfire_"
    })));

builder.Services.AddHangfireServer(options =>
{
    options.WorkerCount = Environment.ProcessorCount * 2;
    options.Queues = new[] { "critical", "default", "scrape", "outreach" };
});

// Register Services & Jobs
builder.Services.AddHttpClient<IGooglePlacesService, GooglePlacesService>();
builder.Services.AddHttpClient<IHunterIoService, HunterIoService>();
builder.Services.AddScoped<IOutreachDispatcher, OutreachDispatcher>();
builder.Services.AddScoped<DailyLeadFetchJob>();
builder.Services.AddScoped<WebsiteStatusCheckJob>();
builder.Services.AddScoped<EmailEnrichmentJob>();

// JWT Authentication
var jwtKey = builder.Configuration["Jwt:Key"] ?? "LeadHunterPro_SuperSecretEnterpriseKey_2026";
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = builder.Configuration["Jwt:Issuer"] ?? "LeadHunterPro",
            ValidAudience = builder.Configuration["Jwt:Audience"] ?? "LeadHunterProClient",
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey))
        };
    });

// CORS
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowViteApp", policy =>
    {
        policy.WithOrigins("http://localhost:3000", "http://localhost:5173")
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials();
    });
});

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI(c => c.SwaggerEndpoint("/swagger/v1/swagger.json", "LeadHunter Pro API v1"));
}

app.UseSerilogRequestLogging();
app.UseHttpsRedirection();
app.UseCors("AllowViteApp");
app.UseAuthentication();
app.UseAuthorization();

// Hangfire Dashboard endpoint
app.UseHangfireDashboard("/hangfire");

// Register Recurring Background Jobs
RecurringJob.AddOrUpdate<DailyLeadFetchJob>(
    "daily-lead-fetch",
    job => job.ExecuteAsync(),
    Cron.Daily(0)); // 12:00 AM

RecurringJob.AddOrUpdate<WebsiteStatusCheckJob>(
    "website-status-check",
    job => job.ExecuteAsync(),
    Cron.Daily(2)); // 2:00 AM

RecurringJob.AddOrUpdate<EmailEnrichmentJob>(
    "email-enrichment",
    job => job.ExecuteAsync(),
    Cron.Daily(3)); // 3:00 AM

app.MapControllers();

app.Run();
