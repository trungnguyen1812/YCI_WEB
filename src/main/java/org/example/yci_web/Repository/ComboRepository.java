package org.example.yci_web.Repository;

import org.example.yci_web.Entity.ComboEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface ComboRepository extends JpaRepository<ComboEntity, Long> {
}
