package org.example.yci_web.Service.Implement;

import org.example.yci_web.Entity.NotificationEntity;
import org.example.yci_web.Entity.UserEntity;
import org.example.yci_web.Model.DTO.NotificationDTO;
import org.example.yci_web.Repository.NotificationRepository;
import org.example.yci_web.Repository.UserRepository;
import org.example.yci_web.Service.NotificationService;
import org.modelmapper.ModelMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.stream.Collectors;

@Service
public class NotificationServiceImpl implements NotificationService {

    @Autowired
    private NotificationRepository notificationRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private ModelMapper modelMapper;

    @Override
    public void push(Long userId, String title, String message, String type, String link) {
        try {
            UserEntity user = userRepository.findById(userId).get();
            NotificationEntity n = new NotificationEntity();
            n.setUserEntity(user);
            n.setTitle(title);
            n.setMessage(message);
            n.setType(type != null ? type : "INFO");
            n.setLink(link);
            n.setIsRead(false);
            n.setCreatedAt(LocalDateTime.now());
            notificationRepository.save(n);
        } catch (NoSuchElementException ignored) {}
    }

    @Override
    public List<NotificationDTO> getNotifications(Long userId) {
        try {
            UserEntity user = userRepository.findById(userId).get();
            return notificationRepository.findTop20ByUserEntityOrderByCreatedAtDesc(user)
                    .stream()
                    .map(n -> {
                        NotificationDTO dto = new NotificationDTO();
                        dto.setIdNotification(n.getIdNotification());
                        dto.setTitle(n.getTitle());
                        dto.setMessage(n.getMessage());
                        dto.setType(n.getType());
                        dto.setIsRead(n.getIsRead());
                        dto.setLink(n.getLink());
                        dto.setCreatedAt(n.getCreatedAt());
                        return dto;
                    })
                    .collect(Collectors.toList());
        } catch (NoSuchElementException e) {
            return List.of();
        }
    }

    @Override
    public long countUnread(Long userId) {
        try {
            UserEntity user = userRepository.findById(userId).get();
            return notificationRepository.countByUserEntityAndIsReadFalse(user);
        } catch (NoSuchElementException e) {
            return 0;
        }
    }

    @Override
    public void markAllRead(Long userId) {
        try {
            UserEntity user = userRepository.findById(userId).get();
            notificationRepository.markAllReadByUser(user);
        } catch (NoSuchElementException ignored) {}
    }

    @Override
    public void markOneRead(Long notificationId, Long userId) {
        notificationRepository.findById(notificationId).ifPresent(n -> {
            if (n.getUserEntity().getIdUser().equals(userId)) {
                n.setIsRead(true);
                notificationRepository.save(n);
            }
        });
    }
}
