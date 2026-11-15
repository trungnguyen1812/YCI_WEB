package org.example.yci_web.Scheduler;

import org.example.yci_web.Entity.BookingEntity;
import org.example.yci_web.Entity.UserEntity;
import org.example.yci_web.Repository.BookingRepository;
import org.example.yci_web.Repository.NotificationRepository;
import org.example.yci_web.Service.NotificationService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;

@Component
public class OverdueNotificationScheduler {

    @Autowired
    private BookingRepository bookingRepository;

    @Autowired
    private NotificationService notificationService;

    @Autowired
    private NotificationRepository notificationRepository;

    /**
     * Chạy mỗi 2 phút.
     * Tìm đơn RENTING đã quá timeEnd >= 30 phút mà chưa được thông báo.
     * Chống trùng: check xem đã có notification tiêu đề chứa mã đơn + "quá giờ" chưa.
     */
    @Scheduled(fixedDelay = 120_000) // 2 phút
    public void checkOverdueBookings() {
        LocalDateTime now = LocalDateTime.now();
        // Ngưỡng: quá 30 phút
        LocalDateTime threshold = now.minusMinutes(30);

        List<BookingEntity> overdueBookings = bookingRepository.findAll().stream()
                .filter(b -> b.getStatusEntity() != null
                        && "RENTING".equals(b.getStatusEntity().getStatusCode()))
                .filter(b -> b.getTimeEnd() != null
                        && b.getTimeEnd().isBefore(threshold))
                .toList();

        for (BookingEntity booking : overdueBookings) {
            UserEntity user = booking.getUserEntity();
            if (user == null) continue;

            String displayCode = booking.getBookingCode() != null
                    ? booking.getBookingCode() : ("#" + booking.getIdBooking());

            // Chống gửi trùng: kiểm tra đã có thông báo trễ cho đơn này chưa
            String dedupeKey = displayCode + " quá giờ";
            boolean alreadySent = notificationRepository
                    .existsByUserEntityAndTitleContaining(user, displayCode);
            if (alreadySent) continue;

            long overMinutes = ChronoUnit.MINUTES.between(booking.getTimeEnd(), now);

            notificationService.push(
                    user.getIdUser(),
                    "⚠️ Đơn " + displayCode + " đã quá giờ trả máy",
                    "Đơn thuê " + displayCode + " đã quá thời hạn trả " + overMinutes
                            + " phút. Nếu không trả trong thời gian quy định, "
                            + "phí phát sinh sẽ được tính theo từng giờ trễ. "
                            + "Vui lòng liên hệ cửa hàng để xử lý.",
                    "WARNING",
                    "/orders"
            );
        }
    }
}
