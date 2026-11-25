using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace LeadHunter.Core.Entities
{
    public enum UserRole
    {
        Admin,
        User
    }

    [Table("Users")]
    public class User
    {
        [Key]
        [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
        public int Id { get; set; }

        [Required]
        [MaxLength(255)]
        [EmailAddress]
        public string Email { get; set; } = string.Empty;

        [Required]
        [MaxLength(255)]
        public string PasswordHash { get; set; } = string.Empty;

        [Required]
        [MaxLength(150)]
        public string FullName { get; set; } = string.Empty;

        [Required]
        public UserRole Role { get; set; } = UserRole.User;

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        public bool IsActive { get; set; } = true;
    }

    [Table("Countries")]
    public class Country
    {
        [Key]
        [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
        public int Id { get; set; }

        [Required]
        [MaxLength(100)]
        public string Name { get; set; } = string.Empty;

        [Required]
        [MaxLength(2)]
        public string Code { get; set; } = string.Empty;

        public bool IsActive { get; set; } = true;
    }

    public enum OutreachChannel
    {
        WhatsApp,
        Email,
        Twitter,
        Instagram,
        Telegram
    }

    [Table("OutreachTemplates")]
    public class OutreachTemplate
    {
        [Key]
        [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
        public int Id { get; set; }

        [Required]
        public int UserId { get; set; }

        [ForeignKey(nameof(UserId))]
        public virtual User? User { get; set; }

        [Required]
        [MaxLength(150)]
        public string Name { get; set; } = string.Empty;

        [Required]
        public OutreachChannel Channel { get; set; }

        [MaxLength(255)]
        public string? Subject { get; set; }

        [Required]
        public string Body { get; set; } = string.Empty;

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }

    public enum OutreachDeliveryStatus
    {
        Pending,
        Sent,
        Failed,
        Delivered
    }

    [Table("OutreachLogs")]
    public class OutreachLog
    {
        [Key]
        [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
        public long Id { get; set; }

        [Required]
        public long LeadId { get; set; }

        [ForeignKey(nameof(LeadId))]
        public virtual Lead? Lead { get; set; }

        [Required]
        public int UserId { get; set; }

        [ForeignKey(nameof(UserId))]
        public virtual User? User { get; set; }

        [Required]
        public OutreachChannel Channel { get; set; }

        [Required]
        public string MessageBody { get; set; } = string.Empty;

        [Required]
        public OutreachDeliveryStatus Status { get; set; } = OutreachDeliveryStatus.Pending;

        public DateTime SentAt { get; set; } = DateTime.UtcNow;

        [MaxLength(500)]
        public string? ErrorMessage { get; set; }
    }

    [Table("DailyFetchLogs")]
    public class DailyFetchLog
    {
        [Key]
        [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
        public int Id { get; set; }

        [Required]
        public DateTime FetchDate { get; set; }

        [Required]
        public int CountryId { get; set; }

        [ForeignKey(nameof(CountryId))]
        public virtual Country? Country { get; set; }

        public int LeadsAdded { get; set; }

        [Required]
        [MaxLength(50)]
        public string Status { get; set; } = "Success";

        public DateTime StartedAt { get; set; } = DateTime.UtcNow;

        public DateTime CompletedAt { get; set; } = DateTime.UtcNow;

        [MaxLength(500)]
        public string? ErrorMessage { get; set; }
    }
}
