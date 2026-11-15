package org.example.yci_web.Model.DTO;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

@Getter
@Setter
@AllArgsConstructor
@NoArgsConstructor
public class NotificationDTO {
    private Long idNotification;
    private String title;
    private String message;
    private String type;
    private Boolean isRead;
    private String link;
    private LocalDateTime createdAt;
}
