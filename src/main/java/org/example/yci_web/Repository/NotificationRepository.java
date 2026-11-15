package org.example.yci_web.Repository;

import org.example.yci_web.Entity.NotificationEntity;
import org.example.yci_web.Entity.UserEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Repository
public interface NotificationRepository extends JpaRepository<NotificationEntity, Long> {

    // Lấy tất cả thông báo của user, mới nhất trước
    List<NotificationEntity> findByUserEntityOrderByCreatedAtDesc(UserEntity user);

    // Chỉ lấy 20 cái mới nhất
    List<NotificationEntity> findTop20ByUserEntityOrderByCreatedAtDesc(UserEntity user);

    // Đếm chưa đọc
    long countByUserEntityAndIsReadFalse(UserEntity user);

    // Kiểm tra đã có thông báo với title chứa keyword chưa (chống gửi trùng)
    boolean existsByUserEntityAndTitleContaining(UserEntity user, String titleKeyword);

    // Đánh dấu tất cả là đã đọc
    @Modifying
    @Transactional
    @Query("UPDATE NotificationEntity n SET n.isRead = true WHERE n.userEntity = :user AND n.isRead = false")
    void markAllReadByUser(UserEntity user);
}
