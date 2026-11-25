using Microsoft.EntityFrameworkCore;
using LeadHunter.Core.Entities;

namespace LeadHunter.Infrastructure.Data
{
    public class ApplicationDbContext : DbContext
    {
        public ApplicationDbContext(DbContextOptions<ApplicationDbContext> options)
            : base(options)
        {
        }

        public DbSet<User> Users => Set<User>();
        public DbSet<Country> Countries => Set<Country>();
        public DbSet<Lead> Leads => Set<Lead>();
        public DbSet<OutreachTemplate> OutreachTemplates => Set<OutreachTemplate>();
        public DbSet<OutreachLog> OutreachLogs => Set<OutreachLog>();
        public DbSet<DailyFetchLog> DailyFetchLogs => Set<DailyFetchLog>();

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);

            // User Email Unique
            modelBuilder.Entity<User>()
                .HasIndex(u => u.Email)
                .IsUnique();

            // Country Code Unique
            modelBuilder.Entity<Country>()
                .HasIndex(c => c.Code)
                .IsUnique();

            // Lead GooglePlaceId Unique
            modelBuilder.Entity<Lead>()
                .HasIndex(l => l.GooglePlaceId)
                .IsUnique();

            // Indexes for high performance querying
            modelBuilder.Entity<Lead>()
                .HasIndex(l => l.CountryId);

            modelBuilder.Entity<Lead>()
                .HasIndex(l => l.Category);

            modelBuilder.Entity<Lead>()
                .HasIndex(l => l.LeadScore);

            modelBuilder.Entity<Lead>()
                .HasIndex(l => l.WebsiteStatus);

            // Enum storage conversions
            modelBuilder.Entity<Lead>()
                .Property(l => l.Source)
                .HasConversion<string>();

            modelBuilder.Entity<Lead>()
                .Property(l => l.WebsiteStatus)
                .HasConversion<string>();

            modelBuilder.Entity<User>()
                .Property(u => u.Role)
                .HasConversion<string>();

            modelBuilder.Entity<OutreachTemplate>()
                .Property(t => t.Channel)
                .HasConversion<string>();

            modelBuilder.Entity<OutreachLog>()
                .Property(l => l.Channel)
                .HasConversion<string>();

            modelBuilder.Entity<OutreachLog>()
                .Property(l => l.Status)
                .HasConversion<string>();
        }
    }
}
