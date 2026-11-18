package org.example.yci_web.Repository;

import org.example.yci_web.Entity.ComboImageEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface ComboImageRepository extends JpaRepository<ComboImageEntity, Long> {
    Optional<ComboImageEntity> findByIdComboImageAndComboEntity_IdCombo(Long idComboImage, Long idCombo);
}
