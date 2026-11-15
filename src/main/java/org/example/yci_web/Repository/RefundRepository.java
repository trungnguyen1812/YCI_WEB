package org.example.yci_web.Repository;

import org.example.yci_web.Entity.RefundEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface RefundRepository extends JpaRepository<RefundEntity, Long> {

    List<RefundEntity> findByStatusOrderByCreatedAtDesc(String status);

    List<RefundEntity> findAllByOrderByCreatedAtDesc();

    @Query("SELECT r FROM RefundEntity r WHERE r.cancellationRequest.idCancellation = :cancellationId AND r.status = :status")
    Optional<RefundEntity> findByIdCancellationAndStatus(@Param("cancellationId") Long cancellationId,
                                                          @Param("status") String status);

    @Query("SELECT COUNT(r) > 0 FROM RefundEntity r WHERE r.cancellationRequest.idCancellation = :cancellationId AND r.status = :status")
    boolean existsByIdCancellationAndStatus(@Param("cancellationId") Long cancellationId,
                                            @Param("status") String status);
}
