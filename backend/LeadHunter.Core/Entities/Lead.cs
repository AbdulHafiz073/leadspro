using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace LeadHunter.Core.Entities
{
    public enum LeadSource
    {
        GooglePlaces,
        SerpAPI,
        Manual
    }

    public enum WebsiteStatus
    {
        NoWebsite,
        Outdated,
        HasWebsite,
        NeedsUpdate
    }

    [Table("Leads")]
    public class Lead
    {
        [Key]
        [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
        public long Id { get; set; }

        [Required]
        [MaxLength(255)]
        public string BusinessName { get; set; } = string.Empty;

        [MaxLength(150)]
        public string? ContactPerson { get; set; }

        [MaxLength(255)]
        public string? Email { get; set; }

        [MaxLength(50)]
        public string? PhoneNumber { get; set; }

        [MaxLength(50)]
        public string? WhatsAppNumber { get; set; }

        [MaxLength(500)]
        public string? WebsiteUrl { get; set; }

        public bool HasWebsite { get; set; }

        [MaxLength(500)]
        public string? Address { get; set; }

        [Required]
        [MaxLength(100)]
        public string City { get; set; } = string.Empty;

        [MaxLength(100)]
        public string? State { get; set; }

        [Required]
        public int CountryId { get; set; }

        [ForeignKey(nameof(CountryId))]
        public virtual Country? Country { get; set; }

        [MaxLength(20)]
        public string? PostalCode { get; set; }

        [Column(TypeName = "decimal(10, 8)")]
        public decimal? Latitude { get; set; }

        [Column(TypeName = "decimal(11, 8)")]
        public decimal? Longitude { get; set; }

        [Required]
        [MaxLength(100)]
        public string Category { get; set; } = string.Empty;

        [Required]
        public LeadSource Source { get; set; } = LeadSource.GooglePlaces;

        [MaxLength(255)]
        public string? GooglePlaceId { get; set; }

        [Column(TypeName = "decimal(3, 2)")]
        public decimal Rating { get; set; } = 0.0m;

        public int ReviewCount { get; set; } = 0;

        [Range(0, 100)]
        public int LeadScore { get; set; } = 0;

        public WebsiteStatus WebsiteStatus { get; set; } = WebsiteStatus.NoWebsite;

        public DateTime? LastCheckedAt { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

        public bool IsSelected { get; set; } = false;
    }
}
