package org.example.yci_web.Service;

import org.example.yci_web.Model.DTO.NotificationDTO;

import java.util.List;

public interface NotificationService {
    void push(Long userId, String title, String message, String type, String link);
    List<NotificationDTO> getNotifications(Long userId);
    long countUnread(Long userId);
    void markAllRead(Long userId);
    void markOneRead(Long notificationId, Long userId);
}
