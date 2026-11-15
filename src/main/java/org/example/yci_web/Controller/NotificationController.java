package org.example.yci_web.Controller;

import jakarta.servlet.http.HttpSession;
import org.example.yci_web.Model.DTO.NotificationDTO;
import org.example.yci_web.Model.DTO.UserDTO;
import org.example.yci_web.Model.Response.DataResponse;
import org.example.yci_web.Model.Response.MessageResponse;
import org.example.yci_web.Service.NotificationService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
public class NotificationController {

    @Autowired
    private NotificationService notificationService;

    private UserDTO currentUser(HttpSession session) {
        Object u = session.getAttribute("currentUser");
        return u instanceof UserDTO ? (UserDTO) u : null;
    }

    // Lấy danh sách thông báo
    @GetMapping("/api/notifications")
    public ResponseEntity<Object> getNotifications(HttpSession session) {
        UserDTO user = currentUser(session);
        if (user == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        List<NotificationDTO> list = notificationService.getNotifications(user.getIdUser());
        DataResponse response = new DataResponse();
        response.setData(list);
        response.setMessage("OK");
        response.setStatus(HttpStatus.OK);
        return ResponseEntity.ok(response);
    }

    // Đếm chưa đọc
    @GetMapping("/api/notifications/unread-count")
    public ResponseEntity<Object> unreadCount(HttpSession session) {
        UserDTO user = currentUser(session);
        if (user == null) return ResponseEntity.ok(Map.of("count", 0));
        long count = notificationService.countUnread(user.getIdUser());
        return ResponseEntity.ok(Map.of("count", count));
    }

    // Đánh dấu tất cả đã đọc
    @PutMapping("/api/notifications/read-all")
    public ResponseEntity<Object> readAll(HttpSession session) {
        UserDTO user = currentUser(session);
        if (user != null) notificationService.markAllRead(user.getIdUser());
        MessageResponse res = new MessageResponse();
        res.setMessage("OK"); res.setStatus(HttpStatus.OK);
        return ResponseEntity.ok(res);
    }

    // Đánh dấu 1 thông báo đã đọc
    @PutMapping("/api/notifications/{id}/read")
    public ResponseEntity<Object> readOne(@PathVariable Long id, HttpSession session) {
        UserDTO user = currentUser(session);
        if (user != null) notificationService.markOneRead(id, user.getIdUser());
        MessageResponse res = new MessageResponse();
        res.setMessage("OK"); res.setStatus(HttpStatus.OK);
        return ResponseEntity.ok(res);
    }
}
