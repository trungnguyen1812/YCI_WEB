package org.example.yci_web.Repository;

import org.example.yci_web.Entity.BookingEntity;
import org.example.yci_web.Entity.CancellationRequestEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface CancellationRequestRepository extends JpaRepository<CancellationRequestEntity, Long> {
    Optional<CancellationRequestEntity> findByBookingEntityAndStatus(BookingEntity booking, String status);
    List<CancellationRequestEntity> findByStatusOrderByCreatedAtDesc(String status);
    List<CancellationRequestEntity> findAllByOrderByCreatedAtDesc();
}
